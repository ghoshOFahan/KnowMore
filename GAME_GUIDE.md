# KnowMore Game Guide

**What this describes:** the behavior and features implemented in this repository as of 5 November 2026. It describes the source in this checkout, including gameplay, safety, profile, and design features. A deployed site reflects these features after its frontend and backend have both been updated.

## What KnowMore is

KnowMore is a turn-based word association game. Players build a chain by entering one word that has a clear, direct meaning-based connection to the previous word. The game uses the chain to create a personal topic map, then gives players a few ways to compare how they think after a match.

The game is designed around associations and semantic patterns. Its topic map is a game profile, not a validated psychological assessment or a diagnosis.

## Player journey

1. **Sign in.** Better Auth manages sessions. The visible landing page offers Google sign-in. Email and password authentication is enabled in the backend auth configuration, although the current landing page does not expose a password form.
2. **Create an initial map.** On first sign-in, the player can answer five one-word prompts: *bridge, mirror, seed, current,* and *echo*. KnowMore compares them with a catalog of 20 topics and assigns five anchors. Alternatively, the player can choose five topics directly.
3. **Open the lobby.** The dashboard centers the player's generated emblem and an animated hanging word chain. **Play** opens the mode chooser. The Daily chain badge shows today's starting word and the player's completed-day streak. Match statistics and the full fingerprint are behind the expandable **Your fingerprint** panel.
4. **Play a match.** The player can play The Thinker, host or join a room, or start the Daily chain.
5. **See the result.** Eligible matches continue through Sync and Read Me, then show a recap, replay, map comparison, and conversation starters.

The navigation includes **Dashboard**, **Profile**, **How it works**, sign out, and the theme switcher. The dashboard and profile are protected by sign-in.

## Game modes

| Mode | What happens |
|---|---|
| **Train with AI** | A two-player match against The Thinker starts immediately. The player supplies the opening word. |
| **Create room** | Creates a waiting room with an eight-letter random code. The host chooses a maximum of 2–7 players. A two-player room can enable Relaxed mode, which removes the turn timer. Play starts when the room reaches its capacity. |
| **Join room** | Joins a waiting room using its code. A room cannot be joined after it has started or is full. |
| **Daily chain** | Starts a match against The Thinker with the same UTC-day starting word for everyone. Completed human trails contribute to that day's shared map. |

The room screen can copy its room code for another signed-in player. Multiplayer rooms support live chat during a match.

## Match rules

### Turns and words

- Players take turns entering **one English word** made of letters only, up to 32 characters. Spaces, punctuation, and numbers are rejected.
- The first player in a regular match can start with any valid word. Daily Chain supplies its shared starting word automatically.
- Every later word must connect clearly to the previous word in its ordinary meaning. Direct part/whole, physical, causal, or familiar associations can qualify. A vague common category, pun, obscure reference, invented third word, or story about the choice is not intended to qualify.
- A word already in that match's chain cannot be played again. Matching is case-insensitive.
- The Thinker asks Gemini for candidate words and submits them to the same semantic referee used for human turns.
- The referee returns an accepted/rejected result, a structured reason, and a link-strength estimate. The accepted link strength is shown in the trail. Verdicts are cached by word pair, regardless of order or case.
- Accepted opening words earn 1 trail point. Later accepted links earn 1–5 points based on strength, with weaker accepted links worth more. Survival chooses the winner; trail points break a tie if no player remains. Post-match bonus points are shown separately.

### Timer and lives

- Each timed human turn has **30 seconds**. Relaxed two-person rooms have no turn timer. The clock pauses while the referee checks a word or a group decision is underway.
- Every player begins with **3 lives**.
- An unrelated word, a repeated word, or a turn timeout costs one life. The turn then moves on.
- At zero lives, the player is eliminated. The last active player wins.
- The interface shows whose turn it is, a countdown, a burning-rope progress indicator, active players, and remaining lives.
- If the AI service fails while generating or checking the Thinker's move, the game restores the turn to the human instead of charging the player a life.
- A disconnected player has a 45-second window to reconnect before being treated as having left the match. Reconnection uses the signed-in identity and can restore the current room state.

### Match chat and audio

- Human multiplayer matches have an in-game chat. Messages are trimmed, limited to 240 characters, rate-limited to one per second per connection, and checked against a basic blocked-language list. Players can report or block another participant. Blocking removes the blocker from the room and prevents the two people joining or reconnecting to a shared room.
- Accepted words play a soft note; rejected links play a snap sound. The sound preference is stored in the browser.
- **Hold to leave** guards the leave action against accidental taps. Keyboard activation can leave without a pointer hold.

### Group review of a borderline rejection

When a human player receives a rejection with a 40–59% strength score, connected human opponents, including eliminated players, have 15 seconds to vote. A majority of eligible voters can allow the word. Otherwise, the rejection stands and the player loses a life. Repeated words and blocked language do not enter this vote.

## End-of-match features

Sync and Read Me are **post-match rounds**, not additional modes in the lobby chooser. They appear after a normal match ends when at least two participants are connected. A match ended by a player leaving does not run the post-match rounds.

### Sync round

1. Players see the final chain word and have **15 seconds** to enter a secret connecting word.
2. A Sync answer must be a new single word and is checked for a connection to the final word.
3. Answers are revealed together when everyone submits or the timer ends.
4. Identical answers earn **Synced: +3 points each**. Different answers with embedding cosine similarity of at least **0.80** earn **Close: +1 each**. Other pairs earn no Sync points. In a group, every pair is scored separately.
5. If any participant does not submit before time runs out, no Sync score is calculated for that round.

The Thinker submits its own Sync answer in AI matches. The result shows each answer, similarity, and the Synced/Close/no-sync outcome.

### Read Me

After Sync, players get another **15 seconds** to guess the topic that another player's accepted match words leaned toward most. The choices use the match participants' anchors plus one decoy topic. In a group, each player chooses one person to read and makes one guess. A correct guess earns **+2 points**.

The topic answer is estimated from how the player's accepted moves changed their closeness to topic anchors. Players with no readable accepted words may be skipped. The Thinker also makes a guess in AI matches. The result reports each direction, such as how many reads each player got right. These bonus points are separate from the survival result. A pair’s Sync results, Read Me guesses, and map-overlap snapshots are saved for the Connections page after the reveal.

### Map comparison and icebreakers

The reveal can show the two players' radar maps overlaid. It also produces three short conversation starters: one about shared topics, one about a topic difference, and one open question based on sample trail words. Each line has a copy button. Gemini generates the lines using supplied topics and a few sample words; a template fallback is used if generation fails. The prompt directs the model to keep them friendly and avoid guessing sensitive personal attributes.

### Recap and replay

The result includes a radar showing each participant’s relative directional pulls for that match. It can also show up to three short recap lines based on the match data, including:

- **Leaper:** at least two recorded links had strength below 50%.
- **Close walker:** most recorded links had strength above 80%.
- **Led:** a player had more trail words and bonus points than the others.
- **Survivor:** the winner won after losing at least two lives.
- **Synced:** at least one pair received the identical-word Sync result.

The Match Replay panel animates the trail word by word, summarizes contributions and the strongest recorded link, and can render a shareable WebM replay where the browser supports it. **Replay trail melody** plays notes derived from the link-strength scores using the browser's audio APIs.

## Player identity and profile

### Generated emblem

The emblem is derived from the player's five topic-anchor scores. The same scores produce the same normalized five-point shape, rotation, and topic-based color. It appears in the dashboard, profile, and player lists.

### Fingerprint map

After a completed match, a BullMQ worker processes its saved word chain:

1. It creates Gemini embeddings for the chain words.
2. For each human, it considers only words that player contributed and accepted.
3. For each move with a previous word, it compares both words with each anchor. Only an increase of more than 0.02 in similarity adds to that anchor, reducing noise from tiny changes.
4. It records repeated pulls toward topics outside the current anchors and keeps an Other bucket for words far from all known topics. The Profile page offers a topic seen at least twice as a replacement for an existing anchor.

This directional calculation uses version 2 analysis. Older word-based scores remain stored separately and are not mixed into the new fingerprint. The profile displays “still forming” until 30 accepted moves have actually been analyzed under the new method. A move needs successful embeddings for both its word and the preceding word. The link-style section shows the proportion of accepted links below 65% strength; it describes moves rather than personality.

The dashboard's expandable fingerprint section and the Profile page show match totals, wins, win rate, recent games, topic distribution, radar map, total contributed words, recent trail words, and the least explored anchor. The topic percentages are the relative distribution of the analyzed scores, not a survey result.

### Identity card

The dashboard previews a visual identity card. Players can choose whether to include their name, map and interests, match statistics, and up to four selected recent words. Recent words are excluded by default. The image can be shared on browsers with file sharing support or downloaded as a PNG.

## Daily chain and streak

- The Daily starting word is selected deterministically from a built-in word list using the current UTC date. It changes at 00:00 UTC.
- Each completed Daily match contributes human-authored links to the community's popular-path map and counts its human participants for the day.
- The Daily result and dashboard compare the player's first link with other players’ first links, including the most common first choice and its percentage. Only the first completed answer per player per day is counted.
- The dashboard badge shows the player's current streak of consecutive UTC dates with a completed Daily match. The streak counts completed matches, not merely opening the mode or starting a room.
- The expandable fingerprint section contains today's popular links and a share action for the map.

## Data and services

- **Authentication:** Better Auth with Google OAuth; backend email/password support is enabled.
- **Live play:** Socket.IO carries room state, turns, chat, reconnection, and post-match submissions.
- **Fast match state:** Redis stores active room state, word history, chat, and timed post-match answers.
- **Persistent history:** PostgreSQL stores completed games, each human's contributed words, directional and off-map scores, pair results, blocks, and reports.
- **AI:** Gemini is used for semantic judging, Thinker word suggestions, embeddings for profile analysis and Read Me/Sync calculations, and icebreaker generation.
- **Background analysis:** BullMQ queues completed-game analysis so profile updates happen outside the live turn loop.
- **Web app:** Next.js provides the site and `/api` proxy to the backend. Socket.IO connects directly to the configured backend URL.

The game UI does not present itself as a clinical or validated personality test. The profile is based on in-game word choices. Icebreaker generation receives match topics and selected sample words to produce its three prompts.

## Current boundaries

- The Connections page shows each human pair’s match count, consecutive Sync streak, Read Me accuracy, and recorded overlap snapshots. Results are saved after the post-match reveal; older games are not backfilled.
- The Daily map is an aggregate of completed Daily matches, not a real-time live map of every in-progress trail.
- The current modes are AI, host room, join room, and Daily chain. Sync and Read Me are post-match features.
- AI commentary generation exists as a backend endpoint, but the normal match-ending flow currently supplies its own completion text; it does not call that endpoint for every result.
- The generated profile is an evolving summary of game behavior. It should not be interpreted as proof of a player's beliefs, traits, or identity outside the game.

## Moderation setup

The in-game report form stores reports for review, and blocking prevents future shared rooms. A basic exact-word language filter is used for chat and game words; it is not comprehensive moderation. To use the protected `/moderation` review page, configure the backend `MODERATOR_USER_IDS` environment variable with a comma-separated list of trusted Better Auth user IDs. With no IDs configured, the report queue is inaccessible. The database migrations in `backend/drizzle-current` must be applied before these features can run against a database.
