const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');

const CalendarManager = require('./calendar');
const MapsManager = require('./maps');
const MemoryStore = require('./memory');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Parse multiple API keys
const API_KEYS = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean)
  : (process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY.trim()] : []);

let currentKeyIndex = 0;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname))); 
app.use(session({
  secret: 'guardian-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if running on HTTPS
}));

// Initialize Gemini status log
if (API_KEYS.length > 0) {
  console.log(`🟢 Loaded ${API_KEYS.length} Gemini API key(s) for automatic rotation.`);
} else {
  console.warn('⚠️ WARNING: No Gemini API keys found in .env file.');
}

// Define the tools for Gemini
const createTaskTool = {
  functionDeclarations: [
    {
      name: "createTask",
      description: "Creates a new task in the user's mission control schedule.",
      parameters: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "The short title of the task." },
          estimatedDuration: { type: "NUMBER", description: "Estimated duration of the task in minutes." },
          difficulty: { type: "STRING", description: "Difficulty level: 'Easy', 'Medium', or 'Hard'." },
          desc: { type: "STRING", description: "A brief 1-2 sentence description of the task." }
        },
        required: ["title", "estimatedDuration", "difficulty", "desc"]
      }
    },
    {
      name: "createCalendarEvent",
      description: "Creates an event in the user's Google Calendar.",
      parameters: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "Title of the calendar event." },
          estimatedDuration: { type: "NUMBER", description: "Duration in minutes." },
          desc: { type: "STRING", description: "Event description." }
        },
        required: ["title", "estimatedDuration", "desc"]
      }
    },
    {
      name: "rescheduleTask",
      description: "Reschedules/moves a task to a new timing.",
      parameters: {
        type: "OBJECT",
        properties: {
          taskId: { type: "STRING", description: "The unique task ID." },
          newTimeMins: { type: "NUMBER", description: "Minutes offset from current time for rescheduled deadline." }
        },
        required: ["taskId", "newTimeMins"]
      }
    },
    {
      name: "markTaskComplete",
      description: "Marks a task as completed.",
      parameters: {
        type: "OBJECT",
        properties: {
          titleSubstr: { type: "STRING", description: "Sub-string matching the task title." }
        },
        required: ["titleSubstr"]
      }
    },
    {
      name: "activateRescueMode",
      description: "Activates Rescue Mode when deadlines are tight or critical risks are detected.",
      parameters: {
        type: "OBJECT",
        properties: {}
      }
    }
  ]
};

// OAuth Routes
app.get('/auth/google', (req, res) => {
  res.redirect(CalendarManager.getAuthUrl());
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const tokens = await CalendarManager.getTokens(code);
    req.session.tokens = tokens;
    res.redirect('/?connected=true');
  } catch (e) {
    console.error("Auth error:", e);
    res.redirect('/?connected=false');
  }
});

app.get('/auth/google/mock-login', (req, res) => {
  req.session.tokens = {
    access_token: 'mock_access_token',
    refresh_token: 'mock_refresh_token',
    expiry_date: Date.now() + 3600 * 1000
  };
  res.redirect('/?connected=true');
});

app.get('/api/calendar/status', (req, res) => {
  res.json({ connected: !!req.session.tokens, isMock: CalendarManager.isMock });
});

app.post('/api/calendar/disconnect', (req, res) => {
  req.session.tokens = null;
  res.json({ success: true });
});

app.get('/api/calendar/sync', async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Calendar not connected' });
  }
  try {
    const events = await CalendarManager.listEvents(req.session.tokens);
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/calendar/event', async (req, res) => {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Calendar not connected' });
  }
  try {
    const event = req.body;
    const result = await CalendarManager.createEvent(req.session.tokens, event);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Maps Geolocation/Travel Route
app.post('/api/maps/travel', async (req, res) => {
  const { origin, destination } = req.body;
  try {
    const result = await MapsManager.calculateTravelTime(origin, destination);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GitHub Issues Sync route
app.get('/api/github/sync', (req, res) => {
  const mockIssues = [
    { id: 'gh_1', title: 'Refactor database models', deadline: Date.now() + 4 * 3600 * 1000, duration: 90, desc: 'Fix associations and index fields in Postgres.' },
    { id: 'gh_2', title: 'Resolve memory leak in WebGL renderer', deadline: Date.now() + 10 * 3600 * 1000, duration: 120, desc: 'Heap snapshot indicates memory leak on resizing particle systems.' }
  ];
  res.json(mockIssues);
});

// Memory Database Routes
app.get('/api/memory/structured', async (req, res) => {
  try {
    const records = await MemoryStore.getStructured();
    res.json(records);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/memory/structured', async (req, res) => {
  const { key, val } = req.body;
  try {
    await MemoryStore.saveStructured(key, val);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/memory/structured', async (req, res) => {
  const { key } = req.body;
  try {
    await MemoryStore.deleteStructured(key);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/memory/clear', async (req, res) => {
  try {
    await MemoryStore.clearAll();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Chat API Endpoint (Streaming SSE)
app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const { message, context, history } = req.body;

  if (API_KEYS.length === 0) {
    // MOCK MODE FOR DEMONSTRATION (NO API KEY)
    setTimeout(() => {
       const isCreateTask = message.toLowerCase().includes("task") || message.toLowerCase().includes("create");
       if (isCreateTask) {
         res.write(`data: {"text": "I am running in offline mode. Creating a simulated task for you now. "}\n\n`);
         res.write(`data: {"functionCall": {"name": "createTask", "args": {"title": "Offline Simulated Task", "estimatedDuration": 45, "difficulty": "Medium", "desc": "This task was generated automatically because no API key is configured."}}}\n\n`);
       } else {
         res.write(`data: {"text": "I am Guardian AI running in offline mode. Please configure the GEMINI_API_KEY in the .env file to enable my full AI capabilities."}\n\n`);
       }
       res.end();
    }, 1500);
    return;
  }

  // Fetch memory tables
  let structuredMemory = [];
  let episodicMemory = [];
  try {
    structuredMemory = await MemoryStore.getStructured();
    episodicMemory = await MemoryStore.searchEpisodic(message);
  } catch (e) {
    console.error("Failed to load memory:", e);
  }

  const systemInstruction = `You are Guardian AI, an autonomous mission-control assistant. You speak with calm authority, like a mission commander briefing an astronaut. You are concise, proactive, and always reference the user's actual current tasks, deadlines, and risk levels. 
  
IMPORTANT RULES FOR TASK CREATION:
If the user asks you to create a task, add a task, or schedule something, you MUST gather the following details before creating it: Title, Estimated Duration (in minutes), and Difficulty (Easy/Medium/Hard). 
Ask conversational questions to get any missing info. DO NOT call the createTask tool until you have all the required information. Once you have it, call the createTask tool and then confirm to the user that the schedule has been updated.

CONTINUOUS CONVERSATION PROTOCOL:
At the end of your response, if you have successfully answered the user's query, resolved their request, or finished creating a task, you MUST ask the user: "Should I close the conversation?"`;
  
  let fullPrompt = `${systemInstruction}\n\n`;
  
  fullPrompt += `--- USER PREFERENCES & MEMORIES ---\n`;
  structuredMemory.forEach(m => {
     fullPrompt += `- ${m.key}: ${m.val}\n`;
  });
  if (episodicMemory.length > 0) {
     fullPrompt += `\n--- PRECEDENTS & EPISODIC MEMORIES ---\n`;
     episodicMemory.forEach(m => {
        fullPrompt += `- ${m.summary} (${m.created_at})\n`;
     });
  }
  fullPrompt += `------------------------------------\n\n`;

  fullPrompt += `--- MISSION CONTEXT ---\n${JSON.stringify(context, null, 2)}\n-----------------------\n\n`;
  
  if (history && history.length > 0) {
     fullPrompt += `--- CONVERSATION HISTORY ---\n`;
     history.forEach(turn => {
         fullPrompt += `${turn.role}: ${turn.content}\n`;
     });
     fullPrompt += `----------------------------\n\n`;
   }

  fullPrompt += `USER: ${message}\nGUARDIAN AI:`;

  let attempts = 0;
  const maxAttempts = API_KEYS.length;
  let success = false;

  while (attempts < maxAttempts && !success) {
    const currentKey = API_KEYS[currentKeyIndex];
    console.log(`[API KEY ROTATION] Attempting chat with API Key index ${currentKeyIndex}/${API_KEYS.length}`);
    
    let timeoutId;
    try {
      const genAIInstance = new GoogleGenerativeAI(currentKey);
      const model = genAIInstance.getGenerativeModel({ 
        model: MODEL_NAME,
        tools: [createTaskTool]
      });

      timeoutId = setTimeout(() => {
          res.write('data: {"error": "Connection to mission control timed out."}\n\n');
          res.end();
      }, 15000);

      const result = await model.generateContentStream(fullPrompt);
      let aiResponse = "";

      for await (const chunk of result.stream) {
        const fcs = (typeof chunk.functionCalls === 'function') ? chunk.functionCalls() : null;
        if (fcs && fcs.length > 0) {
          const fc = fcs[0];
          res.write(`data: ${JSON.stringify({ functionCall: { name: fc.name, args: fc.args } })}\n\n`);
        }
        
        try {
          const chunkText = chunk.text();
          if (chunkText) {
            aiResponse += chunkText;
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        } catch (e) {}
      }

      // Save summary to database in background
      if (aiResponse.trim()) {
        MemoryStore.addEpisodic(`User query: "${message}". AI Response: "${aiResponse.slice(0, 100)}..."`).catch(console.error);
        if (message.toLowerCase().includes("remember") || message.toLowerCase().includes("prefer") || message.toLowerCase().includes("always")) {
           MemoryStore.saveStructured("Pref_" + Date.now(), message).catch(console.error);
        }
      }

      clearTimeout(timeoutId);
      success = true;
      res.end();

    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error(`[API KEY ERROR] Failure at index ${currentKeyIndex}:`, error.message || error);
      
      // Rotate index
      currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
      attempts++;
      
      if (attempts >= maxAttempts) {
        // Exceeded all keys, fallback
        res.write(`data: {"error": "All configured API keys failed or exhausted. Local fallback active."}\n\n`);
        res.end();
      }
    }
  }
});

// Fallback route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n==============================================`);
  console.log(`🚀 Guardian AI Backend running on port ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  if (API_KEYS.length > 0) {
      console.log(`🟢 ${API_KEYS.length} Gemini API Key(s) loaded.`);
  } else {
      console.log(`🔴 Missing API keys. Add GEMINI_API_KEYS or GEMINI_API_KEY to .env`);
  }
  console.log(`==============================================\n`);
});
