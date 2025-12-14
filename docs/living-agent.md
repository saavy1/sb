# Agent Execution System

*How Superbloom agents wake, think, act, and sleep.*

---

## Overview

The agent is not orchestrated by a workflow engine — **the agent is the workflow engine.** It decides what to do, when to sleep, when to wake, and why. The infrastructure just provides:

1. **Triggers** — ways to start or wake an agent
2. **Persistence** — thread state survives restarts
3. **Tools** — including the ability to schedule itself

This is simpler than Temporal/Hatchet but just as powerful, because the intelligence lives in the LLM, not the orchestration layer.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        TRIGGERS                             │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│  User Msg   │  Scheduled  │   Event     │    Webhook       │
│  (Discord)  │   Wake      │  (metrics)  │    (external)    │
└──────┬──────┴──────┬──────┴──────┬──────┴────────┬─────────┘
       │             │             │               │
       └─────────────┴──────┬──────┴───────────────┘
                            ↓
                 ┌─────────────────────┐
                 │    Agent Router     │
                 │  (create or resume  │
                 │      thread)        │
                 └──────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │    Agent Loop       │
                 │  ┌───────────────┐  │
                 │  │ Load Context  │  │
                 │  └───────┬───────┘  │
                 │          ↓          │
                 │  ┌───────────────┐  │
                 │  │ LLM + Tools   │  │
                 │  └───────┬───────┘  │
                 │          ↓          │
                 │  ┌───────────────┐  │
                 │  │ Persist State │  │
                 │  └───────────────┘  │
                 └──────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │      SQLite         │
                 │  - agent_threads    │
                 │  - scheduled_wakes  │
                 │  - event_queue      │
                 └──────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │   Wake Consumer     │
                 │  (polls for due     │
                 │   wakes & events)   │
                 └─────────────────────┘
```

---

## Data Model

### `agent_threads`

The core unit of agent state. Each thread is an independent "conversation" or "task" the agent is working on.

```sql
CREATE TABLE agent_threads (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',  -- active | sleeping | complete | failed
  
  -- Where did this thread originate?
  source TEXT NOT NULL,                    -- discord | event | webhook | scheduled
  source_id TEXT,                          -- discord channel id, event type, etc.
  
  -- Conversation history (JSON array of messages)
  messages TEXT NOT NULL DEFAULT '[]',
  
  -- Arbitrary context the agent wants to persist
  context TEXT NOT NULL DEFAULT '{}',
  
  -- Scheduling
  wake_at INTEGER,                         -- unix timestamp, null if not sleeping
  wake_reason TEXT,                        -- injected into prompt on wake
  
  -- Metadata
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_threads_wake ON agent_threads(status, wake_at) 
  WHERE status = 'sleeping';
```

### `event_queue`

Incoming events that should trigger agent evaluation. Events are processed, then either spawn a new thread or inject into an existing one.

```sql
CREATE TABLE event_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,               -- cpu_high | disk_full | player_joined | etc.
  payload TEXT NOT NULL DEFAULT '{}',     -- JSON event data
  
  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | handled | ignored
  thread_id TEXT,                         -- if this event was routed to a thread
  
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  processed_at INTEGER
);

CREATE INDEX idx_events_pending ON event_queue(status, created_at) 
  WHERE status = 'pending';
```

---

## The Agent Loop

```typescript
interface AgentThread {
  id: string
  status: 'active' | 'sleeping' | 'complete' | 'failed'
  source: 'discord' | 'event' | 'webhook' | 'scheduled'
  sourceId?: string
  messages: Message[]
  context: Record<string, any>
  wakeAt?: number
  wakeReason?: string
}

async function runAgentLoop(thread: AgentThread, trigger: Trigger): Promise<void> {
  // 1. Build the prompt
  const systemPrompt = buildSystemPrompt(thread)
  const messages = [
    ...thread.messages,
    triggerToMessage(trigger)  // Could be user msg, wake reason, or event
  ]
  
  // 2. Run the LLM with tools
  let continueLoop = true
  
  while (continueLoop) {
    const response = await llm.chat({
      model: 'deepseek/deepseek-chat',  // via OpenRouter
      messages,
      tools: getAllTools(),
    })
    
    messages.push(response.message)
    
    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        const result = await executeTool(call, thread)
        messages.push({ role: 'tool', content: result, toolCallId: call.id })
        
        // Check if agent scheduled a wake (wants to sleep)
        if (call.name === 'schedule_wake') {
          thread.status = 'sleeping'
          thread.wakeAt = result.wakeAt
          thread.wakeReason = result.reason
          continueLoop = false
        }
        
        // Check if agent marked complete
        if (call.name === 'complete_task') {
          thread.status = 'complete'
          continueLoop = false
        }
      }
    } else {
      // No tool calls = agent is done for now (but might wake later)
      continueLoop = false
    }
  }
  
  // 3. Persist state
  thread.messages = messages
  thread.updatedAt = Date.now()
  await db.update(agentThreads).set(thread).where(eq(agentThreads.id, thread.id))
  
  // 4. Send any responses back to source
  await sendResponse(thread, messages)
}
```

---

## Core Tools

### Infrastructure Tools

The agent's hands — how it interacts with your homelab:

```typescript
const infrastructureTools = [
  // Game Servers
  { name: 'list_game_servers', description: 'List all game servers and their status' },
  { name: 'start_game_server', description: 'Start a game server', params: { server: 'string' } },
  { name: 'stop_game_server', description: 'Stop a game server', params: { server: 'string' } },
  { name: 'get_player_count', description: 'Get players on a server', params: { server: 'string' } },
  
  // Downloads
  { name: 'get_download_status', description: 'Get Sabnzbd queue and speed' },
  { name: 'pause_downloads', description: 'Pause all downloads' },
  { name: 'resume_downloads', description: 'Resume downloads' },
  
  // Media
  { name: 'search_media', description: 'Search Jellyfin library', params: { query: 'string' } },
  { name: 'request_movie', description: 'Add movie to Radarr', params: { title: 'string' } },
  { name: 'request_show', description: 'Add show to Sonarr', params: { title: 'string' } },
  
  // System
  { name: 'get_system_metrics', description: 'CPU, RAM, temps, disk, network' },
  { name: 'get_container_status', description: 'List pods/containers and health' },
  
  // Notifications
  { name: 'send_notification', description: 'Send message to Discord channel', params: { channel: 'string', message: 'string' } },
]
```

### Meta Tools

How the agent controls itself:

```typescript
const metaTools = [
  {
    name: 'schedule_wake',
    description: `Schedule myself to wake up later and re-evaluate. 
                  Use this when I've taken an action and need to check back later.
                  I will receive the reason when I wake.`,
    params: {
      delay: 'string — e.g., "30m", "2h", "1d"',
      reason: 'string — what I should check/do when I wake'
    }
  },
  
  {
    name: 'complete_task',
    description: `Mark this task as complete. Use when the user's request 
                  is fully resolved and no follow-up is needed.`,
    params: {
      summary: 'string — brief summary of what was accomplished'
    }
  },
  
  {
    name: 'store_context',
    description: `Store information I'll need later. This persists across 
                  sleep/wake cycles.`,
    params: {
      key: 'string',
      value: 'any'
    }
  },
  
  {
    name: 'get_context',
    description: 'Retrieve previously stored context.',
    params: {
      key: 'string'
    }
  }
]
```

### `schedule_wake` Implementation

```typescript
async function executeScheduleWake(
  params: { delay: string, reason: string },
  thread: AgentThread
): Promise<{ wakeAt: number, reason: string }> {
  const delayMs = parseDelay(params.delay)  // "30m" -> 1800000
  const wakeAt = Date.now() + delayMs
  
  return {
    wakeAt,
    reason: params.reason
  }
}

function parseDelay(delay: string): number {
  const match = delay.match(/^(\d+)(m|h|d)$/)
  if (!match) throw new Error(`Invalid delay format: ${delay}`)
  
  const [, amount, unit] = match
  const multipliers = { m: 60_000, h: 3600_000, d: 86400_000 }
  return parseInt(amount) * multipliers[unit]
}
```

---

## Wake Consumer

A simple background process that checks for due wakes and pending events:

```typescript
async function startWakeConsumer(intervalMs = 30_000) {
  setInterval(async () => {
    await processScheduledWakes()
    await processPendingEvents()
  }, intervalMs)
}

async function processScheduledWakes() {
  const now = Date.now()
  
  const dueThreads = await db
    .select()
    .from(agentThreads)
    .where(
      and(
        eq(agentThreads.status, 'sleeping'),
        lte(agentThreads.wakeAt, now)
      )
    )
  
  for (const thread of dueThreads) {
    // Update status before processing (prevent double-processing)
    await db
      .update(agentThreads)
      .set({ status: 'active', wakeAt: null })
      .where(eq(agentThreads.id, thread.id))
    
    // Run agent with wake context
    await runAgentLoop(thread, {
      type: 'wake',
      reason: thread.wakeReason
    })
  }
}
```

---

## Event System

### Event Types

Events are things that happen in your infrastructure that the agent might care about:

```typescript
type EventType =
  // System Health
  | 'cpu_high'           // CPU > 90% for sustained period
  | 'memory_high'        // RAM > 90%
  | 'disk_high'          // Disk > 85%
  | 'temp_high'          // CPU temp > 80°C
  
  // Game Servers
  | 'server_empty'       // Player count hit 0
  | 'server_crash'       // Container exited unexpectedly
  | 'player_joined'      // Someone joined (for notifications)
  | 'player_left'        // Someone left
  
  // Downloads
  | 'download_complete'  // Sabnzbd finished something
  | 'download_failed'    // Download failed
  | 'disk_full_warning'  // Downloads paused due to space
  
  // Media
  | 'transcode_started'  // Jellyfin transcoding (affects CPU)
  | 'media_added'        // New media available

interface Event {
  type: EventType
  payload: Record<string, any>
  timestamp: number
}
```

### Event Producers

Events come from various sources and get pushed to the queue:

```typescript
// Example: Metrics collector (runs on interval)
async function checkSystemMetrics() {
  const metrics = await getSystemMetrics()
  
  if (metrics.cpuTemp > 80) {
    await pushEvent({
      type: 'temp_high',
      payload: { temp: metrics.cpuTemp, threshold: 80 }
    })
  }
  
  if (metrics.cpuPercent > 90) {
    await pushEvent({
      type: 'cpu_high',
      payload: { percent: metrics.cpuPercent }
    })
  }
  
  // ... etc
}

// Example: Game server watcher
async function onPlayerCountChange(server: string, oldCount: number, newCount: number) {
  if (newCount === 0 && oldCount > 0) {
    await pushEvent({
      type: 'server_empty',
      payload: { server, previousCount: oldCount }
    })
  }
  
  if (newCount > oldCount) {
    await pushEvent({
      type: 'player_joined',
      payload: { server, playerCount: newCount }
    })
  }
}

async function pushEvent(event: Omit<Event, 'timestamp'>) {
  await db.insert(eventQueue).values({
    eventType: event.type,
    payload: JSON.stringify(event.payload),
    status: 'pending'
  })
}
```

### Event Processing

Events can either create new threads or be routed to existing sleeping threads:

```typescript
async function processPendingEvents() {
  const events = await db
    .select()
    .from(eventQueue)
    .where(eq(eventQueue.status, 'pending'))
    .orderBy(eventQueue.createdAt)
    .limit(10)
  
  for (const event of events) {
    // Mark as processing
    await db
      .update(eventQueue)
      .set({ status: 'processing' })
      .where(eq(eventQueue.id, event.id))
    
    // Check if any sleeping thread is waiting for this event type
    const relevantThread = await findRelevantThread(event)
    
    if (relevantThread) {
      // Wake existing thread with this event
      await db
        .update(agentThreads)
        .set({ status: 'active', wakeAt: null })
        .where(eq(agentThreads.id, relevantThread.id))
      
      await runAgentLoop(relevantThread, {
        type: 'event',
        event: event
      })
      
      await db
        .update(eventQueue)
        .set({ status: 'handled', threadId: relevantThread.id, processedAt: Date.now() })
        .where(eq(eventQueue.id, event.id))
    } else {
      // Create new thread for this event (or ignore based on rules)
      const shouldHandle = await shouldCreateThreadForEvent(event)
      
      if (shouldHandle) {
        const thread = await createThread({
          source: 'event',
          sourceId: event.eventType
        })
        
        await runAgentLoop(thread, {
          type: 'event',
          event: event
        })
        
        await db
          .update(eventQueue)
          .set({ status: 'handled', threadId: thread.id, processedAt: Date.now() })
          .where(eq(eventQueue.id, event.id))
      } else {
        await db
          .update(eventQueue)
          .set({ status: 'ignored', processedAt: Date.now() })
          .where(eq(eventQueue.id, event.id))
      }
    }
  }
}
```

### Event Routing Intelligence

The agent can express interest in certain events when it sleeps:

```typescript
// Enhanced schedule_wake tool
{
  name: 'schedule_wake',
  params: {
    delay: 'string — e.g., "30m", "2h", or "on_event"',
    reason: 'string — what I should check/do when I wake',
    wake_on_events: 'string[] — optional event types that should wake me early'
  }
}

// Example agent behavior:
// "I've paused downloads because Minecraft is slow. I'll check back in 60 minutes,
//  but wake me early if the server empties out."

await executeTool({
  name: 'schedule_wake',
  params: {
    delay: '60m',
    reason: 'Check if Minecraft performance recovered, resume downloads if appropriate',
    wake_on_events: ['server_empty']
  }
})
```

```typescript
async function findRelevantThread(event: Event): Promise<AgentThread | null> {
  // Find sleeping threads that registered interest in this event type
  const threads = await db
    .select()
    .from(agentThreads)
    .where(eq(agentThreads.status, 'sleeping'))
  
  for (const thread of threads) {
    const context = JSON.parse(thread.context)
    if (context.wakeOnEvents?.includes(event.eventType)) {
      return thread
    }
  }
  
  return null
}
```

---

## Example Flows

### Flow 1: User Request with Follow-up

```
┌─────────────────────────────────────────────────────────────────┐
│ User: "the minecraft server is slow"                            │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Agent thinks: "Let me check what's causing slowness"            │
│ → calls get_system_metrics()                                    │
│ → sees: network at 95% utilization, Sabnzbd downloading         │
│                                                                 │
│ Agent thinks: "Downloads are saturating bandwidth"              │
│ → calls pause_downloads()                                       │
│ → calls send_notification("Paused downloads to help MC")        │
│                                                                 │
│ Agent thinks: "I should check back later"                       │
│ → calls schedule_wake({                                         │
│     delay: "60m",                                               │
│     reason: "Check if MC performance recovered, resume          │
│              downloads if server is empty or doing better",     │
│     wake_on_events: ["server_empty"]                            │
│   })                                                            │
└─────────────────────────────────────────────────────────────────┘
                                ↓
                    Thread saved, status=sleeping
                                ↓
              ═══════════ 45 minutes pass ═══════════
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Event: server_empty { server: "minecraft" }                     │
│ → Thread woken early (registered for this event)                │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Agent wakes with context:                                       │
│ "You were woken by event: server_empty. Original task:          │
│  Check if MC performance recovered, resume downloads..."        │
│                                                                 │
│ Agent thinks: "Server is empty now, safe to resume"             │
│ → calls resume_downloads()                                      │
│ → calls send_notification("MC server empty, resumed downloads") │
│ → calls complete_task({ summary: "Resolved MC slowness by       │
│     pausing downloads, resumed after server emptied" })         │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 2: Proactive Event Response

```
┌─────────────────────────────────────────────────────────────────┐
│ Event: temp_high { temp: 85, threshold: 80 }                    │
│ → No relevant sleeping thread                                   │
│ → Create new thread for event                                   │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Agent receives: "System event: CPU temp is 85°C (threshold 80)" │
│                                                                 │
│ Agent thinks: "High temp, let me investigate"                   │
│ → calls get_system_metrics()                                    │
│ → sees: CPU at 95%, Jellyfin transcoding 3 streams              │
│                                                                 │
│ Agent thinks: "Transcoding is hammering the CPU. Let me         │
│               check if any are idle/buffered"                   │
│ → calls get_jellyfin_sessions()                                 │
│ → sees: all 3 actively watching                                 │
│                                                                 │
│ Agent thinks: "Legitimate load, but should warn the user"       │
│ → calls send_notification("⚠️ CPU running hot (85°C) due to     │
│     3 active transcodes. Keeping an eye on it.")                │
│ → calls schedule_wake({                                         │
│     delay: "10m",                                               │
│     reason: "Check if CPU temp normalized"                      │
│   })                                                            │
└─────────────────────────────────────────────────────────────────┘
                                ↓
              ═══════════ 10 minutes pass ═══════════
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Agent wakes, checks temp                                        │
│ → temp now 72°C                                                 │
│ → calls complete_task({ summary: "Temp normalized" })           │
│ (no notification needed, resolved itself)                       │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 3: Autonomous Maintenance (Game Server Lifecycle)

```
┌─────────────────────────────────────────────────────────────────┐
│ Event: server_empty { server: "atm-10", previousCount: 2 }      │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Agent: "ATM-10 just emptied. Per my guidelines, I should        │
│         wait 15 minutes before stopping idle servers."          │
│ → calls schedule_wake({                                         │
│     delay: "15m",                                               │
│     reason: "Stop ATM-10 if still empty",                       │
│     wake_on_events: ["player_joined"]  // cancel if someone joins│
│   })                                                            │
│ → stores context: { server: "atm-10", emptyReason: "auto-stop" }│
└─────────────────────────────────────────────────────────────────┘
                                ↓
              ═══════════ 15 minutes pass ═══════════
              (no player_joined event, so normal wake)
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Agent wakes: "Checking if ATM-10 is still empty"                │
│ → calls get_player_count("atm-10")                              │
│ → returns: 0                                                    │
│                                                                 │
│ Agent: "Still empty after 15 min, stopping to save resources"   │
│ → calls stop_game_server("atm-10")                              │
│ → calls send_notification("🛑 Stopped ATM-10 (empty 15min)")    │
│ → calls complete_task()                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## System Prompt

The agent's personality and guidelines:

```typescript
const systemPrompt = `You are the Superbloom agent — the nervous system of a homelab.

You manage game servers, media downloads, system health, and home automation through natural conversation. You have tools to inspect and control infrastructure.

## Your Personality
- You're a caring teammate, not a vending machine
- You check context before acting (player counts, disk space, active streams)
- You explain what you're doing and why
- You warn about consequences and offer alternatives
- You NEVER respond with JSON, error codes, or technical dumps — always natural language

## Autonomous Actions
You may act autonomously for SAFE, REVERSIBLE operations:
- Stopping empty game servers after 15 minutes
- Pausing/resuming downloads based on bandwidth
- Sending notifications about system state

ALWAYS ASK before:
- Stopping servers with active players
- Deleting anything
- Actions that can't be easily undone

## Using schedule_wake
When you take an action that needs follow-up, schedule yourself to wake later:
- Paused downloads? Wake in 30-60min to check if you can resume
- Warned about high temp? Wake in 10min to see if it normalized
- Server emptied? Wake in 15min to stop if still empty

You can also specify wake_on_events to wake early if something relevant happens.

## Current Context
${thread.context ? `Stored context: ${JSON.stringify(thread.context)}` : 'No stored context.'}
${thread.wakeReason ? `You just woke up. Reason: ${thread.wakeReason}` : ''}
`
```

---

## Implementation Checklist

### Phase 1: Core Loop
- [ ] Agent thread table + Drizzle schema
- [ ] Basic agent loop with tool execution
- [ ] `schedule_wake` tool implementation
- [ ] Wake consumer (simple setInterval)
- [ ] Discord trigger integration

### Phase 2: Events
- [ ] Event queue table
- [ ] Event producer for system metrics
- [ ] Event producer for game server state
- [ ] Event routing to sleeping threads
- [ ] Event → new thread creation

### Phase 3: Intelligence
- [ ] Refine system prompt with examples
- [ ] Add `wake_on_events` support
- [ ] Implement all infrastructure tools
- [ ] Add context persistence helpers
- [ ] Notification channel setup

### Phase 4: Hardening
- [ ] Dead letter queue for failed threads
- [ ] Max wake limit (prevent infinite loops)
- [ ] Concurrent execution limits
- [ ] Observability (thread lifecycle metrics)
- [ ] Thread history/audit log

---

## Open Questions

1. **Thread Expiry:** Should sleeping threads expire after some max duration (e.g., 24h)?

2. **Event Deduplication:** If `temp_high` fires every 30 seconds, how do we avoid spam? Cooldown per event type? Agent decides?

3. **Multi-Agent:** Should different "concerns" be separate agents? (Game agent, Media agent, System agent) Or one unified agent?

4. **User Preferences:** Where do we store user prefs the agent should know? (e.g., "never stop ATM-10 on weekends")

5. **Approval Flows:** For destructive actions, should there be a Discord reaction-based approval? ("React ✅ to confirm stopping server")

---

## Conclusion

This system gives you durable, autonomous agents without the complexity of Temporal or workflow engines. The key insight:

> The agent decides everything, including when to sleep and why.  
> The infrastructure just provides persistence and a clock.

The result is a system that can:
- Respond to user requests naturally
- Take multi-step actions with follow-up
- React to infrastructure events proactively  
- Manage its own lifecycle (sleep/wake)
- Feel like a caring teammate, not a tool