"""Object storage through the S3 API, and an in-memory stand-in for tests.

Two buckets: `originals` (never public) and `public` (readable by anyone at `IMAGE_BASE_URL`).
"""

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

import anyio
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from combo_api.settings import Settings

Bucket = Literal["originals", "public"]
BUCKETS: tuple[Bucket, ...] = ("originals", "public")
# Public images never change under a key: a changed image gets a new key.
IMMUTABLE = "public, max-age=31536000, immutable"
NOT_FOUND = {"404", "NoSuchKey", "NoSuchBucket", "NotFound"}


class Missing(LookupError):
    """No object under this key."""


@dataclass(frozen=True)
class Blob:
    data: bytes
    content_type: str | None
    cache_control: str | None


@dataclass(frozen=True)
class Listed:
    key: str
    size: int
    last_modified: datetime


class Storage(Protocol):
    async def put(
        self,
        bucket: Bucket,
        key: str,
        data: bytes,
        content_type: str,
        cache_control: str | None = None,
    ) -> None: ...

    async def get(self, bucket: Bucket, key: str) -> Blob:
        """The object, or `Missing`."""
        ...

    async def delete(self, bucket: Bucket, key: str) -> None:
        """Delete the object; deleting a missing object is not an error."""
        ...

    async def list(self, bucket: Bucket, prefix: str = "") -> list[Listed]:
        """Every object whose key starts with `prefix`, by key."""
        ...


@dataclass
class MemoryStorage:
    """Objects in a dictionary. `fail_deletes` makes every delete raise, as a storage outage
    would."""

    objects: dict[tuple[Bucket, str], tuple[Blob, datetime]] = field(default_factory=dict)
    fail_deletes: bool = False
    now: Callable[[], datetime] = lambda: datetime.now(UTC)

    async def put(
        self,
        bucket: Bucket,
        key: str,
        data: bytes,
        content_type: str,
        cache_control: str | None = None,
    ) -> None:
        self.objects[bucket, key] = (Blob(data, content_type, cache_control), self.now())

    async def get(self, bucket: Bucket, key: str) -> Blob:
        try:
            return self.objects[bucket, key][0]
        except KeyError:
            raise Missing(key) from None

    async def delete(self, bucket: Bucket, key: str) -> None:
        if self.fail_deletes:
            raise OSError("storage unavailable")
        self.objects.pop((bucket, key), None)

    async def list(self, bucket: Bucket, prefix: str = "") -> list[Listed]:
        return [
            Listed(key, len(blob.data), modified)
            for (b, key), (blob, modified) in sorted(self.objects.items())
            if b == bucket and key.startswith(prefix)
        ]

    def keys(self, bucket: Bucket) -> set[str]:
        return {key for b, key in self.objects if b == bucket}


class S3Storage:
    """The S3 API through `boto3`, with path-style addressing. Each call runs in a worker
    thread."""

    def __init__(self, settings: Settings) -> None:
        self.bucket_names: dict[Bucket, str] = {
            "originals": settings.storage_originals_bucket,
            "public": settings.storage_public_bucket,
        }
        self.client: Any = boto3.client(
            "s3",
            endpoint_url=settings.storage_endpoint_url,
            region_name=settings.storage_region,
            aws_access_key_id=settings.storage_access_key_id,
            aws_secret_access_key=settings.storage_secret_access_key.get_secret_value(),
            config=Config(
                s3={"addressing_style": "path"},
                # Checksums only where the S3 API requires them, as R2 and RustFS expect.
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
                connect_timeout=5,
                read_timeout=30,
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )

    async def call(self, operation: str, **arguments: Any) -> Any:
        method = getattr(self.client, operation)
        return await anyio.to_thread.run_sync(lambda: method(**arguments))

    async def put(
        self,
        bucket: Bucket,
        key: str,
        data: bytes,
        content_type: str,
        cache_control: str | None = None,
    ) -> None:
        extra = {} if cache_control is None else {"CacheControl": cache_control}
        await self.call(
            "put_object",
            Bucket=self.bucket_names[bucket],
            Key=key,
            Body=data,
            ContentType=content_type,
            **extra,
        )

    async def get(self, bucket: Bucket, key: str) -> Blob:
        try:
            found = await self.call("get_object", Bucket=self.bucket_names[bucket], Key=key)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in NOT_FOUND:
                raise Missing(key) from None
            raise
        body = found["Body"]
        try:
            data = await anyio.to_thread.run_sync(body.read)
        finally:
            body.close()
        return Blob(data, found.get("ContentType"), found.get("CacheControl"))

    async def delete(self, bucket: Bucket, key: str) -> None:
        await self.call("delete_object", Bucket=self.bucket_names[bucket], Key=key)

    async def list(self, bucket: Bucket, prefix: str = "", page_size: int = 1000) -> list[Listed]:
        listed: list[Listed] = []
        token: dict[str, str] = {}
        while True:
            page = await self.call(
                "list_objects_v2",
                Bucket=self.bucket_names[bucket],
                Prefix=prefix,
                MaxKeys=page_size,
                **token,
            )
            listed += [
                Listed(item["Key"], item["Size"], item["LastModified"])
                for item in page.get("Contents", [])
            ]
            if not page.get("IsTruncated"):
                return sorted(listed, key=lambda item: item.key)
            token = {"ContinuationToken": page["NextContinuationToken"]}

    # Bucket setup, for the `init` command and tests.

    async def bucket_exists(self, name: str) -> bool:
        try:
            await self.call("head_bucket", Bucket=name)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in NOT_FOUND:
                return False
            raise
        return True

    async def create_bucket(self, name: str) -> None:
        await self.call("create_bucket", Bucket=name)

    async def remove_bucket(self, name: str) -> None:
        await self.call("delete_bucket", Bucket=name)

    @staticmethod
    def public_read_policy(name: str) -> dict[str, Any]:
        """Anyone may read objects of this bucket; nothing else."""
        return {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicRead",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{name}/*"],
                }
            ],
        }

    async def bucket_policy(self, name: str) -> dict[str, Any] | None:
        try:
            found = await self.call("get_bucket_policy", Bucket=name)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == "NoSuchBucketPolicy":
                return None
            raise
        policy: dict[str, Any] = json.loads(found["Policy"])
        return policy

    async def allow_public_read(self, name: str) -> None:
        await self.call(
            "put_bucket_policy", Bucket=name, Policy=json.dumps(self.public_read_policy(name))
        )
