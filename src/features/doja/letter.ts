export interface DojaLetter {
  addressedTo: string;
  message: string;
  from: string;
}

export const MAX_WORDS = 500;
export const EMPTY_LETTER: DojaLetter = {
  addressedTo: '',
  message: '',
  from: '',
};

export function wordCount(message: string): number {
  return message.trim().match(/\S+/gu)?.length ?? 0;
}

export function validateLetter(input: unknown): DojaLetter {
  if (!input || typeof input !== 'object') throw new Error('Invalid letter.');
  const record = input as Record<string, unknown>;
  const addressedTo = record.addressedTo;
  const message = record.message;
  const from = record.from;
  if (
    typeof addressedTo !== 'string' ||
    typeof message !== 'string' ||
    typeof from !== 'string'
  )
    throw new Error('Complete all three fields.');
  const recipient = addressedTo.trim();
  const signature = from.trim();
  if (!recipient || !message.trim() || !signature)
    throw new Error('Complete all three fields.');
  if (
    recipient.length > 80 ||
    signature.length > 80 ||
    /\p{Cc}/u.test(recipient + signature)
  )
    throw new Error('Names must be one line and at most 80 characters.');
  if (message.length > 6000 || wordCount(message) > MAX_WORDS)
    throw new Error('Keep the message to 500 words and 6,000 characters.');
  return { addressedTo: recipient, message, from: signature };
}
