CREATE INDEX "Message_fromUserId_toUserId_createdAt_idx" ON "Message"("fromUserId", "toUserId", "createdAt");
CREATE INDEX "Message_toUserId_fromUserId_createdAt_idx" ON "Message"("toUserId", "fromUserId", "createdAt");
CREATE INDEX "Message_toUserId_read_idx" ON "Message"("toUserId", "read");
