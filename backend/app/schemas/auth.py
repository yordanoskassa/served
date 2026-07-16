from pydantic import BaseModel


class GoogleAuthRequest(BaseModel):
    credential: str


class UserProfile(BaseModel):
    email: str
    name: str
    given_name: str
    picture: str | None = None
