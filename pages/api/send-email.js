// pages/api/send-email.js

const { getSession } = require('next-auth/react');
const formidable = require('formidable');
const { google } = require('googleapis');
const fs = require('fs');

// Disable the built-in body parser to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
};

// Promisify the form.parse method for cleaner async/await usage
function parseForm(req) {
  const form = new formidable.IncomingForm({
    keepExtensions: true, // Retain file extensions
    multiples: false,     // Disable multiple file uploads
    maxFileSize: 10 * 1024 * 1024, // 10 MB limit (optional)
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// Function to retrieve current headers
async function getCurrentHeaders(sheets, spreadsheetId, sheetName) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`, // Fetch the first row
    });

    const rows = response.data.values;
    if (rows && rows.length > 0) {
      return rows[0]; // Return the first row as headers
    } else {
      return []; // No headers found
    }
  } catch (error) {
    console.error('Error retrieving current headers:', error);
    throw error;
  }
}

// Function to add headers
async function addHeaders(sheets, spreadsheetId, sheetName, headers) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!1:1`, // Update the first row
      valueInputOption: 'RAW',
      resource: {
        values: [headers],
      },
    });
    console.log('Headers added successfully.');
  } catch (error) {
    console.error('Error adding headers:', error);
    throw error;
  }
}

// Function to append data to Google Sheets
async function appendToSheet(auth, values) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SPREADSHEET_ID; // Ensure this is set correctly
  const sheetName = 'Sheet1'; // Change if your sheet has a different name

  const desiredHeaders = ['Recruiter Email', 'Subject', 'Timestamp', 'Status'];

  try {
    // Step 1: Retrieve current headers
    const currentHeaders = await getCurrentHeaders(sheets, spreadsheetId, sheetName);

    // Step 2: Check if headers match desired headers
    const headersMatch =
      currentHeaders.length === desiredHeaders.length &&
      currentHeaders.every((header, index) => header === desiredHeaders[index]);

    // Step 3: If headers don't match, add headers
    if (!headersMatch) {
      await addHeaders(sheets, spreadsheetId, sheetName, desiredHeaders);
    }

    // Step 4: Append the data row
    const resource = {
      values: [values], // values should be a flat array corresponding to headers
    };

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:D`, // Adjust the range based on the number of columns
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource,
    });

    console.log('Data appended to Google Sheets successfully.');
  } catch (error) {
    console.error('Error appending data to Google Sheets:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const session = await getSession({ req });

  if (!session) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { fields, files } = await parseForm(req);

    // Logging for debugging
    console.log('Parsed Fields:', fields);
    console.log('Parsed Files:', files);

    const { toEmail, subject, message } = fields;
    let resume = files.resume;

    if (!resume) {
      console.error('No resume file uploaded.');
      res.status(400).json({ error: 'No resume file uploaded.' });
      return;
    }

    // Handle if 'resume' is an array
    if (Array.isArray(resume)) {
      resume = resume[0];
    }

    console.log('Resume File Details:', resume);

    const resumePath = resume.filepath || resume.path;

    if (!resumePath) {
      console.error('Resume filepath is undefined.');
      res.status(400).json({ error: 'Resume filepath is undefined.' });
      return;
    }

    console.log('Resume Path:', resumePath);

    // Read the resume file
    let resumeData;
    try {
      resumeData = fs.readFileSync(resumePath);
      console.log('Resume data read successfully.');
    } catch (readError) {
      console.error('Error reading resume file:', readError);
      res.status(500).json({ error: 'Failed to read resume file.' });
      return;
    }

    // Initialize Google OAuth2 Client with Client ID and Client Secret
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    auth.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    // Refresh the access token if expired
    if (session.expires_at && session.expires_at < Date.now()) {
      try {
        const newToken = await auth.refreshAccessToken();
        auth.setCredentials({
          access_token: newToken.credentials.access_token,
          refresh_token: newToken.credentials.refresh_token || session.refreshToken, // Use existing refresh token if new one not provided
        });
        console.log('Access token refreshed.');
      } catch (tokenError) {
        console.error('Error refreshing access token:', tokenError);
        res.status(500).json({ error: 'Failed to refresh access token.' });
        return;
      }
    }

    // Extract string values from fields
    const toEmailStr = Array.isArray(toEmail) ? toEmail[0] : toEmail;
    const subjectStr = Array.isArray(subject) ? subject[0] : subject;
    const messageStr = Array.isArray(message) ? message[0] : message;

    // Send the email
    try {
      await sendEmail(auth, toEmailStr, subjectStr, messageStr, resumeData, resume.originalFilename);
      console.log('Email sent successfully.');
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      res.status(500).json({ error: 'Failed to send email.' });
      return;
    }

    // Log the email in Google Sheets
    try {
      await appendToSheet(auth, [toEmailStr, subjectStr, new Date().toISOString(), 'Sent']);
      console.log('Email logged in Google Sheets.');
    } catch (sheetError) {
      console.error('Error logging email to Google Sheets:', sheetError);
      // Optionally, you can choose to fail the request or proceed
      // Here, we'll proceed without failing the request
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Unexpected error in send-email handler:', err);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}

async function sendEmail(auth, toEmail, subject, message, resumeData, filename) {
  const gmail = google.gmail({ version: 'v1', auth });

  // Construct the email with attachment
  const boundary = '__MY_BOUNDARY__';
  let email = '';

  email += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
  email += 'MIME-Version: 1.0\r\n';
  email += `To: ${toEmail}\r\n`;
  email += `Subject: ${subject}\r\n\r\n`;

  // Email body
  email += `--${boundary}\r\n`;
  email += 'Content-Type: text/plain; charset="UTF-8"\r\n';
  email += 'MIME-Version: 1.0\r\n';
  email += 'Content-Transfer-Encoding: 7bit\r\n\r\n';
  email += `${message}\r\n\r\n`;

  // Attachment
  email += `--${boundary}\r\n`;
  email += `Content-Type: application/octet-stream; name="${filename}"\r\n`;
  email += 'MIME-Version: 1.0\r\n';
  email += 'Content-Transfer-Encoding: base64\r\n';
  email += `Content-Disposition: attachment; filename="${filename}"\r\n\r\n`;
  email += resumeData.toString('base64');
  email += `\r\n--${boundary}--`;

  const encodedMessage = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });
}
