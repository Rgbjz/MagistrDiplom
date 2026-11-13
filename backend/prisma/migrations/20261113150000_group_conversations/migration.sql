-- Group chats: named conversations with an owner who manages members.
ALTER TYPE "ConversationType" ADD VALUE 'GROUP';

ALTER TABLE "Conversation" ADD COLUMN "title" TEXT,
ADD COLUMN "ownerId" INTEGER;
