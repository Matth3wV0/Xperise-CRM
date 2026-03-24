import { prisma } from "@xperise/database";
import {
  searchOutreachEmails,
  type ApolloEmailMessage,
} from "../modules/apollo/apollo-sequences.service";
import { sendTelegramMessage } from "../common/telegram-notify";

/**
 * Poll Apollo for email status updates on active campaigns.
 * Runs every 30 minutes via node-cron.
 *
 * For each active campaign with an apolloSequenceId:
 *  1. Fetch outreach emails from Apollo
 *  2. Create/update EmailLog records with open/reply/bounce timestamps
 *  3. Create ContactAction entries for replies and bounces
 *  4. Notify Telegram for new replies
 */
export async function pollApolloEmailStats(): Promise<void> {
  console.log("[apollo-poll] Starting email stats poll...");

  // Find all active campaigns linked to Apollo sequences
  const campaigns = await prisma.campaign.findMany({
    where: {
      apolloSequenceId: { not: null },
      status: { in: ["ACTIVE", "PAUSED"] },
    },
    select: {
      id: true,
      name: true,
      apolloSequenceId: true,
    },
  });

  if (campaigns.length === 0) {
    console.log("[apollo-poll] No active Apollo-linked campaigns found.");
    return;
  }

  let totalNewOpens = 0;
  let totalNewReplies = 0;
  let totalNewBounces = 0;
  const replyContacts: string[] = [];

  for (const campaign of campaigns) {
    if (!campaign.apolloSequenceId) continue;

    try {
      // Fetch all outreach emails for this sequence (page 1 — up to 100)
      const result = await searchOutreachEmails({
        sequenceId: campaign.apolloSequenceId,
        page: 1,
        perPage: 100,
      });

      const messages = result.emailer_messages ?? [];
      if (messages.length === 0) continue;

      for (const msg of messages) {
        await processEmailMessage(msg, campaign.id, campaign.name, {
          onNewOpen: () => totalNewOpens++,
          onNewReply: (contactName) => {
            totalNewReplies++;
            replyContacts.push(contactName);
          },
          onNewBounce: () => totalNewBounces++,
        });
      }

      // Handle pagination if there are more pages
      if (result.pagination && result.pagination.total_pages > 1) {
        const pagesToFetch = Math.min(result.pagination.total_pages, 5); // cap at 5 pages
        for (let page = 2; page <= pagesToFetch; page++) {
          const pageResult = await searchOutreachEmails({
            sequenceId: campaign.apolloSequenceId,
            page,
            perPage: 100,
          });
          for (const msg of pageResult.emailer_messages ?? []) {
            await processEmailMessage(msg, campaign.id, campaign.name, {
              onNewOpen: () => totalNewOpens++,
              onNewReply: (contactName) => {
                totalNewReplies++;
                replyContacts.push(contactName);
              },
              onNewBounce: () => totalNewBounces++,
            });
          }
        }
      }
    } catch (err) {
      console.error(
        `[apollo-poll] Failed to poll campaign "${campaign.name}":`,
        err
      );
    }
  }

  console.log(
    `[apollo-poll] Done. Opens: ${totalNewOpens}, Replies: ${totalNewReplies}, Bounces: ${totalNewBounces}`
  );

  // Notify Telegram about new replies (high-value events)
  if (replyContacts.length > 0) {
    await sendTelegramMessage(
      `<b>Email Replies Detected</b>\n` +
        replyContacts
          .map((name) => `• <b>${name}</b> replied!`)
          .join("\n") +
        `\n\nTotal: ${replyContacts.length} new replies. Check CRM for details.`
    );
  }

  // Notify about bounces if any (operational alert)
  if (totalNewBounces > 0) {
    await sendTelegramMessage(
      `<b>Email Bounces</b>: ${totalNewBounces} emails bounced. Check campaign recipients for invalid addresses.`
    );
  }
}

async function processEmailMessage(
  msg: ApolloEmailMessage,
  campaignId: string,
  campaignName: string,
  callbacks: {
    onNewOpen: () => void;
    onNewReply: (contactName: string) => void;
    onNewBounce: () => void;
  }
): Promise<void> {
  // Find or create EmailLog for this Apollo message
  let emailLog = await prisma.emailLog.findUnique({
    where: { apolloMessageId: msg.id },
  });

  // Find the CRM contact by Apollo contact ID
  const contact = msg.contact_id
    ? await prisma.contact.findFirst({
        where: { apolloContactId: msg.contact_id },
        select: { id: true, fullName: true },
      })
    : null;

  if (!contact) {
    // Cannot match this Apollo email to a CRM contact — skip
    return;
  }

  const sentAt = msg.sent_at ? new Date(msg.sent_at) : new Date();
  const openedAt = msg.opened_at ? new Date(msg.opened_at) : null;
  const repliedAt = msg.replied_at ? new Date(msg.replied_at) : null;
  const bouncedAt = msg.bounced_at ? new Date(msg.bounced_at) : null;

  // Determine status
  let status: string = "SENT";
  if (bouncedAt) status = "BOUNCED";
  else if (repliedAt) status = "REPLIED";
  else if (openedAt) status = "OPENED";

  if (!emailLog) {
    // Create new EmailLog
    emailLog = await prisma.emailLog.create({
      data: {
        subject: msg.subject || "(no subject)",
        body: msg.body_text ?? null,
        status: status as any,
        sentAt,
        openedAt,
        repliedAt,
        bouncedAt,
        apolloMessageId: msg.id,
        contactId: contact.id,
        campaignId,
      },
    });

    // These are all "new" since the record was just created
    if (openedAt) callbacks.onNewOpen();
    if (repliedAt) callbacks.onNewReply(contact.fullName);
    if (bouncedAt) callbacks.onNewBounce();
  } else {
    // Update existing EmailLog with new data
    const updates: Record<string, unknown> = {};
    let hasNewEvent = false;

    if (openedAt && !emailLog.openedAt) {
      updates.openedAt = openedAt;
      updates.status = "OPENED";
      callbacks.onNewOpen();
      hasNewEvent = true;
    }
    if (repliedAt && !emailLog.repliedAt) {
      updates.repliedAt = repliedAt;
      updates.status = "REPLIED";
      callbacks.onNewReply(contact.fullName);
      hasNewEvent = true;

      // Create ContactAction for the reply
      await prisma.contactAction.create({
        data: {
          type: "EMAIL_SENT",
          status: "FOLLOW_UP",
          note: `Reply received on campaign "${campaignName}": ${msg.subject}`,
          contactId: contact.id,
          performedById: (
            await prisma.campaign.findUnique({
              where: { id: campaignId },
              select: { createdById: true },
            })
          )?.createdById ?? contact.id, // fallback shouldn't happen
          metadata: { apolloMessageId: msg.id, source: "apollo_poll" },
        },
      });

      // Update contact lastTouchedAt
      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastTouchedAt: repliedAt },
      });
    }
    if (bouncedAt && !emailLog.bouncedAt) {
      updates.bouncedAt = bouncedAt;
      updates.status = "BOUNCED";
      callbacks.onNewBounce();
      hasNewEvent = true;
    }

    if (hasNewEvent) {
      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: updates as any,
      });
    }
  }
}
