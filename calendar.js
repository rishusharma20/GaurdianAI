const { google } = require('googleapis');

// Load env variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/auth/google/callback';

const hasCredentials = CLIENT_ID && CLIENT_SECRET;

const oauth2Client = hasCredentials 
  ? new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
  : null;

const CalendarManager = {
  isMock: !hasCredentials,

  getAuthUrl() {
    if (this.isMock) {
      return '/auth/google/mock-login';
    }
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      prompt: 'select_account'
    });
  },

  async getTokens(code) {
    if (this.isMock) {
      return {
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expiry_date: Date.now() + 3600 * 1000
      };
    }
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  },

  getClient(tokens) {
    if (this.isMock) return null;
    const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    client.setCredentials(tokens);
    return client;
  },

  async listEvents(tokens) {
    if (this.isMock) {
      // Mock Events
      return [
        {
          id: 'mock_c1',
          summary: 'ML Project Presentation',
          description: 'Presenting research on custom neural nets.',
          start: { dateTime: new Date(Date.now() + 3 * 3600 * 1000).toISOString() },
          end: { dateTime: new Date(Date.now() + 4.5 * 3600 * 1000).toISOString() },
          location: 'Building A, Room 102'
        },
        {
          id: 'mock_c2',
          summary: 'Code Review Meeting',
          description: 'Going over PR reviews and tasks.',
          start: { dateTime: new Date(Date.now() + 6 * 3600 * 1000).toISOString() },
          end: { dateTime: new Date(Date.now() + 7 * 3600 * 1000).toISOString() }
        }
      ];
    }

    const client = this.getClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime'
    });
    return response.data.items || [];
  },

  async createEvent(tokens, event) {
    if (this.isMock) {
      return { id: 'mock_created_' + Math.random().toString(36).substr(2, 9) };
    }
    const client = this.getClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        description: event.desc,
        start: { dateTime: new Date(event.deadline - event.estimatedDuration * 60000).toISOString() },
        end: { dateTime: new Date(event.deadline).toISOString() }
      }
    });
    return response.data;
  },

  async patchEvent(tokens, eventId, event) {
    if (this.isMock) {
      return { id: eventId };
    }
    const client = this.getClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: {
        summary: event.title,
        description: event.desc,
        start: { dateTime: new Date(event.deadline - event.estimatedDuration * 60000).toISOString() },
        end: { dateTime: new Date(event.deadline).toISOString() }
      }
    });
    return response.data;
  }
};

module.exports = CalendarManager;
