# Shoe Adventure — Fun Factor Pass

## Status: approved plan, implementation starting now

This document explains, in plain terms, the four changes we agreed on after stepping back and asking what the game is missing. It is meant to be readable without looking at any code. A more technical execution plan also exists if you want the file-by-file detail, but this is the version meant for review.

## The four gaps, and why each one matters

**There is no sound anywhere in the game.** No jump sound, no landing thud, no chime when you collect something, no sound when you hit an enemy or get hit yourself, and no music. This was confirmed directly in the code, not assumed. Interestingly, an old, much earlier version of this game, a Python prototype that has since been removed from the project, had a full sound library: ten different jump sounds, background music, collect and hurt and victory cues. That intent existed once and simply never made it into the current version of the game. For a game whose whole pitch is a tactile, toy-scale, cinematic world, silence undercuts that pitch more than almost anything else could.

**The Left Shoe looks identical to the Right Shoe.** The entire story of this game is two shoes finding each other, but right now, the Left Shoe is a mirrored copy of the exact same picture used for the Right Shoe. This traces back to an earlier point in development where the real, distinct Left Shoe artwork failed to generate, and the game quietly fell back to reusing the Right Shoe's art instead. That fallback was never revisited. This is a small technical gap with an outsized effect on whether the reunion at the end of the game actually feels earned.

**There are far fewer enemies and terrain types than there are power-ups.** The game already has a rich set of six different shoe transformations and eight distinct power-ups. Against that, there are only three enemy types and four kinds of platform, and none of the platforms do anything special, they are all just solid ground. The variety the player collects outpaces the variety of things to use it against.

**Nothing about a playthrough is remembered.** There is no best time, no way to compare one run to another, and refreshing the page loses everything. Given that we are already building a small database to track how AI agents perform on their runs, extending that same idea to track human runs too, and letting people compare their time against an agent's, is a natural, low-cost addition.

## What we are building for each

For sound, every effect and the background music will be generated directly in code using the browser's built-in audio tools, rather than needing any external sound files. This keeps the approach consistent with how this project already avoids checking in large media files. You will hear a jump sound, a landing sound, a collection chime, a hit sound, a stomp sound, a checkpoint sound, and a victory sound, plus a simple looping music bed that gets more intense when danger is nearby. A mute button is being added to the game's controls so this is never forced on anyone.

For the Left Shoe, since neither of us has a way to generate brand new character artwork in this session, the fix is a color treatment rather than new art: the same picture will be tinted toward the warm cream and gold look the game's own design notes originally called for, instead of showing up as an exact coral copy of the Right Shoe. It is a real visual improvement, just not a from-scratch redraw.

For variety, two new enemies are being added. One is a moth that flies in a wandering pattern and occasionally dive-bombs toward the player, which is a genuinely different kind of movement from anything currently in the game. The other is a stationary gum turret that an ordinary attack cannot defeat, only the Gum Stomp ability can, which gives an existing ability a reason to matter more. Two new pieces of terrain are also being added: a bounce pad that launches the player into the air, and a crumbling platform that gives way briefly after being stepped on and then comes back.

For persistence, completing a run, whether played by a person or by an AI agent, will be recorded to a small database with the time it took and how well it went. Your own best time will always be shown to you immediately, saved right in your browser, and a small leaderboard will show the fastest recorded run overall, labeled by whether a person or an agent set it. This is the same infrastructure being built for tracking AI agent decisions, just extended to cover full runs by anyone.

## What this does not include

This pass does not add real recorded music or professionally composed audio, since generating that is outside what either of us can do directly in this session; the generated, code-based sound is a genuine improvement over silence, not a placeholder for something better arriving later unless you want to swap in real audio files yourself down the line. It also does not include a redraw of any character art, for the same reason. And it adds two new enemies and two new terrain types rather than a much larger roster, to keep this pass finishable and testable rather than open-ended.
