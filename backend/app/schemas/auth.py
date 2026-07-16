from pydantic import BaseModel


class GoogleAuthRequest(BaseModel):
    credential: str


class UserProfile(BaseModel):
    # Stable Google account identifier.  The email is mutable, so callers
    # should use this value when associating dashboard data with a user.
    subject: str = ""
    email: str
    name: str
    given_name: str
    picture: str | None = None
