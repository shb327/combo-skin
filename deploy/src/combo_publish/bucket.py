"""R2 buckets through the S3 API: the public image bucket and the private backup bucket. Only
buckets named in the settings, on the account in the settings, with the token read for them."""

from dataclasses import dataclass
from typing import Any, Protocol

from combo_publish.keychain import R2Credentials


@dataclass(frozen=True)
class ObjectInfo:
    size: int
    etag: str


class Bucket(Protocol):
    def objects(self, prefix: str = "") -> dict[str, ObjectInfo]: ...

    def put(self, key: str, body: bytes, content_type: str, cache_control: str | None) -> str:
        """Stores an object and returns its ETag, without quotes."""
        ...

    def get(self, key: str) -> bytes: ...

    def delete(self, keys: list[str]) -> None: ...


class BucketFactory(Protocol):
    def __call__(self, account_id: str, bucket: str, credentials: R2Credentials) -> Bucket: ...


class R2Bucket:
    def __init__(self, account_id: str, bucket: str, credentials: R2Credentials) -> None:
        import boto3
        from botocore.config import Config

        self._bucket = bucket
        self._client: Any = boto3.session.Session().client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            region_name="auto",
            aws_access_key_id=credentials.access_key_id,
            aws_secret_access_key=credentials.secret_access_key,
            config=Config(retries={"max_attempts": 5, "mode": "standard"}),
        )

    def objects(self, prefix: str = "") -> dict[str, ObjectInfo]:
        found: dict[str, ObjectInfo] = {}
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                found[item["Key"]] = ObjectInfo(int(item["Size"]), str(item["ETag"]).strip('"'))
        return found

    def put(self, key: str, body: bytes, content_type: str, cache_control: str | None) -> str:
        extra = {"CacheControl": cache_control} if cache_control else {}
        answer = self._client.put_object(
            Bucket=self._bucket, Key=key, Body=body, ContentType=content_type, **extra
        )
        return str(answer["ETag"]).strip('"')

    def get(self, key: str) -> bytes:
        answer = self._client.get_object(Bucket=self._bucket, Key=key)
        body: bytes = answer["Body"].read()
        return body

    def delete(self, keys: list[str]) -> None:
        for start in range(0, len(keys), 1000):
            chunk = [{"Key": key} for key in keys[start : start + 1000]]
            answer = self._client.delete_objects(
                Bucket=self._bucket, Delete={"Objects": chunk, "Quiet": True}
            )
            if answer.get("Errors"):
                failed = ", ".join(error["Key"] for error in answer["Errors"][:5])
                raise RuntimeError(f"Could not delete {failed}")
