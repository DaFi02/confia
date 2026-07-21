"""Private Google Cloud Storage adapter for receipt evidence."""

from __future__ import annotations

import asyncio
import base64
import binascii
import os
import re
from dataclasses import dataclass
from uuid import uuid4

from google.cloud import storage
from google.cloud.exceptions import GoogleCloudError


class ReceiptStorageError(RuntimeError):
    """A safe, user-facing storage failure."""


@dataclass(frozen=True)
class StoredReceipt:
    path: str
    content_type: str


class ReceiptStorage:
    """Stores receipts privately; the database retains only object metadata."""

    _DATA_URL = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$", re.IGNORECASE)
    _EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    _MAX_BYTES = max(1, int(os.environ.get("RECEIPT_UPLOAD_MAX_BYTES", str(10 * 1024 * 1024))))

    def __init__(self, bucket_name: str, project: str | None = None):
        self.bucket_name = bucket_name
        self.client = storage.Client(project=project or None)
        self.bucket = self.client.bucket(bucket_name)

    @classmethod
    def from_environment(cls) -> "ReceiptStorage | None":
        bucket_name = os.environ.get("GCS_RECEIPTS_BUCKET", "synapse-dafi-confia-receipts").strip()
        return cls(bucket_name, os.environ.get("GOOGLE_CLOUD_PROJECT", "synapse-dafi")) if bucket_name else None

    @classmethod
    def decode_data_url(cls, data_url: str) -> tuple[bytes, str]:
        match = cls._DATA_URL.fullmatch(data_url.strip())
        if not match:
            raise ReceiptStorageError("The receipt must be a valid PNG, JPG, or WebP image.")
        content_type, encoded = match.groups()
        try:
            content = base64.b64decode(encoded, validate=True)
        except binascii.Error as error:
            raise ReceiptStorageError("Could not read the receipt image.") from error
        if not content or len(content) > cls._MAX_BYTES:
            raise ReceiptStorageError("The receipt must be at most 10 MB.")
        return content, content_type.lower()

    async def upload_data_url(self, user_id: int, data_url: str) -> StoredReceipt:
        content, content_type = self.decode_data_url(data_url)
        extension = self._EXTENSIONS[content_type]
        path = f"receipts/{user_id}/{uuid4().hex}.{extension}"
        try:
            await asyncio.to_thread(
                self.bucket.blob(path).upload_from_string,
                content,
                content_type=content_type,
                checksum="auto",
            )
        except GoogleCloudError as error:
            raise ReceiptStorageError("We could not save the receipt. Please try again.") from error
        return StoredReceipt(path=path, content_type=content_type)

    async def download(self, path: str) -> bytes:
        try:
            return await asyncio.to_thread(self.bucket.blob(path).download_as_bytes, checksum="auto")
        except GoogleCloudError as error:
            raise ReceiptStorageError("The receipt is not available right now.") from error

    async def delete(self, path: str) -> None:
        try:
            await asyncio.to_thread(self.bucket.blob(path).delete)
        except GoogleCloudError:
            # Database integrity is more important than cleanup. The object's
            # versioning/soft-delete policy makes a later cleanup possible.
            return
