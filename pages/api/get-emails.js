// pages/api/get-emails.js

import { getSession } from 'next-auth/react';
import { google } from 'googleapis';

export default async function handler(req, res) {
  const session = await getSession({ req });

  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    const emails = await getEmailsFromSheet(auth);

    if (emails.length === 0) {
      res.json({ error: 'No emails found' });
    } else {
      res.json({ emails });
    }
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
async function getEmailsFromSheet(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1',
  });

  const rows = response.data.values;
  if (rows && rows.length) {
    return rows.map((row, index) => ({
      id: index,
      toEmail: row[0],
      subject: row[1],
      date: row[2],
      status: row[3],
    }));
  } else {
    return [];
  }
}