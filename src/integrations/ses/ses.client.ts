import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ENV } from '../../config/env';

function getClient(): SESClient {
  return new SESClient({
    region: ENV.AWS_REGION,
    credentials: {
      accessKeyId: ENV.AWS_ACCESS_KEY_ID,
      secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY,
    },
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const client = getClient();

  const command = new SendEmailCommand({
    Source: ENV.AWS_SES_FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  });

  await client.send(command);
}
