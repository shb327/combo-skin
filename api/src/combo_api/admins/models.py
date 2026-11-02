"""Admin tables. Admins are never deleted, only disabled."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    LargeBinary,
    Text,
    true,
)
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from combo_api.db import Base

USERNAME_PATTERN = "^[a-z0-9._-]{3,32}$"


class Admin(Base):
    __tablename__ = "admins"
    __table_args__ = (CheckConstraint(f"username ~ '{USERNAME_PATTERN}'", name="username"),)

    id: Mapped[int] = mapped_column(Identity(), primary_key=True)
    username: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(server_default=true())
    password_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id", ondelete="CASCADE"), index=True)
    token_digest: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    csrf_token: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LoginFailure(Base):
    __tablename__ = "login_failures"
    __table_args__ = (
        Index("ix_login_failures_username_digest_created_at", "username_digest", "created_at"),
        Index("ix_login_failures_client_ip_created_at", "client_ip", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    username_digest: Mapped[bytes] = mapped_column(LargeBinary)
    client_ip: Mapped[str] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
