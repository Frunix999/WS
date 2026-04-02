# schemas.py
from pydantic import BaseModel

class ReleaseItemPayload(BaseModel):
    id: int

class OOSPayload(BaseModel):
    id: int

class UpdateItemPayload(BaseModel):
    id: int
    available: int

class ReportResultPayload(BaseModel):
    id: int

    price: float
    available: int
    quantity: int
    cost_now: float
    cost_now_uah: float
    currency: str

    prime: int = 0
    shipping: float = 0.0
    shipping_ua: float = 0.0

class LogPayload(BaseModel):
    module: str
    event: str
    level: str
    data: dict


class SaveSourcePayload(BaseModel):
    asin: str
    url: str
    html: str
    platform: str | None = None

class UpdateWeightPayload(BaseModel):
    id: int
    weight_kg: float