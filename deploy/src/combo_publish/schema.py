"""The public schema from an OpenAPI document: the schemas of `PublicCombo` and `ComboCounts`
and everything they reference.

Two uses: comparing the running API's schemas with the built commit's before an export (a stack
not rebuilt after a merge would publish data the website does not expect), and validating every
data file against the built commit's schema. Objects with listed properties are closed: a field
the schema does not list is an error, so nothing beyond the public shape is published.
"""

from typing import Any

ROOTS = ("PublicCombo", "ComboCounts")
REF_PREFIX = "#/components/schemas/"
# Annotations that do not change what a document may hold.
ANNOTATIONS = frozenset({"title", "description"})

type Json = Any


def _components(openapi: Json) -> dict[str, Json]:
    components = openapi.get("components", {}).get("schemas", {})
    if not isinstance(components, dict):
        raise ValueError("The OpenAPI document has no components.schemas object")
    return components


def _refs(schema: Json) -> set[str]:
    found: set[str] = set()
    if isinstance(schema, dict):
        ref = schema.get("$ref")
        if isinstance(ref, str) and ref.startswith(REF_PREFIX):
            found.add(ref.removeprefix(REF_PREFIX))
        for value in schema.values():
            found |= _refs(value)
    elif isinstance(schema, list):
        for value in schema:
            found |= _refs(value)
    return found


def _strip(schema: Json) -> Json:
    """A schema without its annotations. Property names are kept, even `title` or
    `description`."""
    if isinstance(schema, list):
        return [_strip(value) for value in schema]
    if not isinstance(schema, dict):
        return schema
    stripped: dict[str, Json] = {}
    for key, value in schema.items():
        if key in ANNOTATIONS:
            continue
        if key == "properties" and isinstance(value, dict):
            stripped[key] = {name: _strip(item) for name, item in value.items()}
        else:
            stripped[key] = _strip(value)
    return stripped


def public_schemas(openapi: Json) -> dict[str, Json]:
    """The public schemas by name, without titles and descriptions. A name referenced but
    missing from the document maps to None."""
    components = _components(openapi)
    found: dict[str, Json] = {}
    todo = list(ROOTS)
    while todo:
        name = todo.pop()
        if name in found:
            continue
        schema = components.get(name)
        found[name] = None if schema is None else _strip(schema)
        if schema is not None:
            todo.extend(_refs(schema))
    return found


def schema_drift(running: Json, built: Json) -> list[str]:
    """The names of the public schemas that differ between two OpenAPI documents, sorted."""
    left, right = public_schemas(running), public_schemas(built)
    return sorted(name for name in left.keys() | right.keys() if left.get(name) != right.get(name))


class PublicSchema:
    """Validates documents against the public schemas of one OpenAPI document."""

    def __init__(self, openapi: Json) -> None:
        self._schemas = public_schemas(openapi)
        missing = sorted(name for name, schema in self._schemas.items() if schema is None)
        if missing:
            raise ValueError(f"The OpenAPI document lacks the schemas {', '.join(missing)}")

    def combo_errors(self, value: Json) -> list[str]:
        return self._check(value, {"$ref": REF_PREFIX + "PublicCombo"}, "combo")

    def counts_errors(self, value: Json) -> list[str]:
        return self._check(value, {"$ref": REF_PREFIX + "ComboCounts"}, "counts")

    def _check(self, value: Json, schema: Json, where: str) -> list[str]:
        if "$ref" in schema:
            return self._check(value, self._schemas[schema["$ref"].removeprefix(REF_PREFIX)], where)
        if "anyOf" in schema:
            options = [self._check(value, option, where) for option in schema["anyOf"]]
            if any(not errors for errors in options):
                return []
            # The option whose errors go deepest says most about what is wrong.
            return min(options, key=len) if len(options) > 1 else options[0]
        if "const" in schema and value != schema["const"]:
            return [f"{where}: must be {schema['const']!r}"]
        kind = schema.get("type")
        if kind is not None and not _is_type(value, kind):
            return [f"{where}: must be {kind}, not {type(value).__name__}"]
        errors: list[str] = []
        if kind == "object":
            properties: dict[str, Json] = schema.get("properties", {})
            extra = schema.get("additionalProperties")
            for name in schema.get("required", []):
                if name not in value:
                    errors.append(f"{where}: missing field {name}")
            for name, item in value.items():
                if name in properties:
                    errors += self._check(item, properties[name], f"{where}.{name}")
                elif isinstance(extra, dict):
                    errors += self._check(item, extra, f"{where}.{name}")
                else:
                    errors.append(f"{where}: field {name} is not in the public schema")
        if kind == "array":
            for index, item in enumerate(value):
                errors += self._check(item, schema.get("items", {}), f"{where}[{index}]")
        return errors


def _is_type(value: Json, kind: str) -> bool:
    match kind:
        case "object":
            return isinstance(value, dict)
        case "array":
            return isinstance(value, list)
        case "string":
            return isinstance(value, str)
        case "integer":
            return isinstance(value, int) and not isinstance(value, bool)
        case "number":
            return isinstance(value, int | float) and not isinstance(value, bool)
        case "boolean":
            return isinstance(value, bool)
        case "null":
            return value is None
    raise ValueError(f"Unknown schema type {kind!r}")
