-- Previous refresh token, accepted once more after a rotation.
ALTER TABLE "Session" ADD COLUMN "prevRefreshTokenHash" TEXT;
