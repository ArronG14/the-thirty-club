import { database } from '../backend/database.ts';
import { processMessages } from '../backend/sms.ts';

export default async function conciergeDispatch(): Promise<Response> {
  const result = await processMessages(database(process.env), process.env);
  console.log('[backend] SMS dispatch', result.processed);
  return new Response(null, { status: 204 });
}
export const config = { schedule: '* * * * *' };
