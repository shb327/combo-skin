"""Request and response models for combos."""

import unicodedata
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, BaseModel, Field, model_validator
from pydantic_core import PydanticCustomError

from combo_api.catalog.routes import Rarity
from combo_api.combos.models import DESCRIPTION_MAX, SEED_MAX, SEEDS_MAX, Status

SLUG_MAX = 64


def decimal(value: float) -> Decimal:
    """A JSON number as the decimal it was written as: 0.06 is 0.06, not its binary neighbour."""
    return Decimal(repr(float(value)))


def at_most(places: int) -> AfterValidator:
    def check(value: float) -> float:
        exponent = decimal(value).as_tuple().exponent
        if isinstance(exponent, int) and exponent < -places:
            raise PydanticCustomError(
                "decimal_max_places",
                "Decimal input should have no more than {decimal_places} decimal places",
                {"decimal_places": places},
            )
        return value

    return AfterValidator(check)


def sorted_unique(seeds: list[int]) -> list[int]:
    if len(set(seeds)) != len(seeds):
        raise PydanticCustomError("duplicate_seed", "Each pattern seed may appear only once")
    return sorted(seeds)


def clean_description(value: str | None) -> str | None:
    """Trimmed plain text with line breaks; empty becomes null."""
    if value is None:
        return None
    text = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if any(c != "\n" and unicodedata.category(c) == "Cc" for c in text):
        raise PydanticCustomError(
            "value_error", "Value error, control characters other than line breaks are refused"
        )
    if len(text) > DESCRIPTION_MAX:
        raise PydanticCustomError(
            "string_too_long",
            "String should have at most {max_length} characters",
            {"max_length": DESCRIPTION_MAX},
        )
    return text or None


Rating = Annotated[float, Field(ge=0, le=10), at_most(2)]
FloatBound = Annotated[float, Field(ge=0, le=1), at_most(4)]
Seed = Annotated[int, Field(strict=True, ge=0, le=SEED_MAX)]
Seeds = Annotated[list[Seed], Field(max_length=SEEDS_MAX), AfterValidator(sorted_unique)]
Description = Annotated[
    str | None, Field(max_length=4 * DESCRIPTION_MAX), AfterValidator(clean_description)
]
Slug = Annotated[str, Field(min_length=1, max_length=SLUG_MAX)]
PublicId = Annotated[str, Field(min_length=1, max_length=SLUG_MAX)]


class Conditions(BaseModel):
    """What one item of a combo needs: a float range, when wear matters, and pattern seeds,
    when the combo needs specific patterns (empty means any)."""

    float_from: FloatBound | None = None
    float_to: FloatBound | None = None
    seeds: Seeds = []

    @model_validator(mode="after")
    def complete_range(self) -> Self:
        if (self.float_from is None) != (self.float_to is None):
            raise PydanticCustomError(
                "value_error", "Value error, float_from and float_to go together"
            )
        if (
            self.float_from is not None
            and self.float_to is not None
            and (self.float_from >= self.float_to)
        ):
            raise PydanticCustomError(
                "value_error", "Value error, float_from must be below float_to"
            )
        return self


class FinishRef(BaseModel):
    type_slug: Slug
    finish_slug: Slug


class ItemIn(Conditions, FinishRef):
    """A finish and its conditions."""


class ComboIn(BaseModel):
    glove: ItemIn
    knife: ItemIn
    rating: Rating
    description: Description = None


class ComboUpdate(BaseModel):
    version: int = Field(ge=1)
    rating: Rating
    description: Description
    glove: Conditions
    knife: Conditions


IdList = Annotated[list[PublicId], Field(min_length=1, max_length=500)]


class PublishRequest(BaseModel):
    """Combos to publish: `ids`, or every draft with `all_drafts`. Exactly one of them."""

    ids: IdList | None = None
    all_drafts: Literal[True] | None = None

    @model_validator(mode="after")
    def exactly_one(self) -> Self:
        if (self.ids is None) == (self.all_drafts is None):
            raise PydanticCustomError("value_error", "Value error, send ids or all_drafts")
        return self


class UnpublishRequest(BaseModel):
    ids: IdList


class Changed(BaseModel):
    changed: int


class ComboPage(BaseModel):
    total: int
    items: list[AdminCombo]


class BatchFinish(BaseModel):
    """A knife finish name a batch can use, and how many active knife types have it."""

    slug: str
    display_name: str
    knife_types: int


class Existing(BaseModel):
    id: str
    status: Status
    version: int
    rating: float
    description: str | None


class Candidate(BaseModel):
    knife: Item
    existing: Existing | None


class KnifeFinishName(BaseModel):
    slug: str
    display_name: str | None


class Candidates(BaseModel):
    glove: Item
    knife_finish: KnifeFinishName
    candidates: list[Candidate]


BATCH_MAX = 50


class BatchCreate(BaseModel):
    knife_type: Slug
    rating: Rating
    description: Description = None
    glove: Conditions = Field(default_factory=Conditions)
    knife: Conditions = Field(default_factory=Conditions)


class BatchUpdate(BaseModel):
    id: PublicId
    version: int = Field(ge=1)
    rating: Rating
    description: Description


class BatchIn(BaseModel):
    """New combos of one glove finish with one knife finish name across knife types, and
    rating and description changes to existing combos of the same batch."""

    glove: FinishRef
    knife_finish: Slug
    create: Annotated[list[BatchCreate], Field(max_length=BATCH_MAX)] = []
    update: Annotated[list[BatchUpdate], Field(max_length=BATCH_MAX)] = []

    @model_validator(mode="after")
    def size(self) -> Self:
        if not 1 <= len(self.create) + len(self.update) <= BATCH_MAX:
            raise PydanticCustomError(
                "value_error", f"Value error, a batch holds 1 to {BATCH_MAX} items"
            )
        return self


class BatchSaved(BaseModel):
    created: list[AdminCombo]
    updated: list[AdminCombo]


class KnifeTypeName(BaseModel):
    slug: str
    name: str


class KnifeOrderOut(BaseModel):
    knife_types: list[KnifeTypeName]


class KnifeOrderIn(BaseModel):
    """Every active knife type's slug, once, in the new order."""

    slugs: Annotated[list[Slug], Field(max_length=100)]


class Item(BaseModel):
    type_slug: str
    type_name: str
    finish_slug: str
    display_name: str
    image_url: str
    rarity: Rarity
    active: bool
    # The finish's own float range from the catalog; null for Vanilla.
    float_min: float | None
    float_max: float | None
    # This combo's conditions.
    float_from: float | None
    float_to: float | None
    seeds: list[int]


class PublicCombo(BaseModel):
    id: str
    rating: float
    description: str | None
    glove: Item
    knife: Item


class AdminCombo(BaseModel):
    id: str
    status: Status
    version: int
    rating: float
    description: str | None
    glove: Item
    knife: Item
    created_at: datetime
    created_by: str
    updated_at: datetime
    updated_by: str
    published_at: datetime | None


def number(value: Decimal | None) -> float | None:
    return None if value is None else float(value)
