-- CreateTable
CREATE TABLE "DesktopRelease" (
    "version" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "downloadUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesktopRelease_pkey" PRIMARY KEY ("version")
);

-- Current release and user-provided share link; no release notes supplied.
INSERT INTO "DesktopRelease" ("version", "downloadUrl")
VALUES ('1.0.0-beta.10', 'https://share.feijipan.com/s/4b7LXxbh');
