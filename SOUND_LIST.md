# Shoe Adventure - sound list for real audio files

This is the exact list of sound files the game can use, if you want to record or generate real mp3s to replace the placeholder sounds I built directly in code. You do not need to provide all of them, or any of them, right away. The game already makes a synthesized version of every one of these on its own, so nothing is missing or broken while you work through this list at whatever pace you like. The moment a real file shows up under the right name, the game switches to it automatically and stops using the synthesized version for that one sound. You can add them one at a time.

## Where the files go

Save each file under `client/public/audio/` in the project folder, using the exact file name listed below. For example, the jump sound is `client/public/audio/jump.mp3`.

## Format

Plain mp3 files. Short sounds should be quick, well under a second in most cases. The two music files should be seamless loops, meaning the end flows back into the beginning without an audible click or gap.

## The list

**jump.mp3** - A light, springy sound for the moment the shoe leaps into the air. Think of a quick upward whoosh or a cartoon boing, playful rather than mechanical. About a quarter of a second.

**land.mp3** - A soft thud for landing back on solid ground after a jump or a fall. Should feel padded and toy-like, not heavy or violent. About a tenth of a second.

**collect-common.mp3** - A bright, simple chime for picking up an ordinary item, such as a button or a feather. Short and pleasant, like a small coin or bell sound. About a tenth of a second.

**collect-heart.mp3** - A warmer, slightly more emotional chime for picking up a heart, since hearts represent health and care in this story. A touch softer and rounder than the common collect sound. About a quarter of a second.

**collect-powerup.mp3** - A small triumphant flourish for picking up an ability or a shoe-form transformation, such as the Moon Step or Coral Chrome forms. This one should feel like a little celebration, a short rising phrase rather than a single note. About a third of a second.

**hit.mp3** - A sound for the moment the player takes damage from an enemy. Should read as an impact without being harsh or scary, this is a family-friendly game. About a sixth of a second.

**stomp.mp3** - The sound of defeating an ordinary enemy with a stomp. Quick, satisfying, a bit cartoonish. About a sixth of a second.

**stomp-boss.mp3** - The sound of defeating a mini-boss or boss enemy. Should feel bigger and more rewarding than the regular stomp sound, since these are rarer, harder wins. About a third of a second.

**checkpoint.mp3** - A gentle two-note confirmation chime for reaching a checkpoint along the route. Reassuring, like a progress-saved sound. About a quarter of a second.

**victory.mp3** - The sound that plays when the Right Shoe and Left Shoe are reunited at the end of a run. This is the emotional payoff of the whole game, so it should feel warm and complete, a short musical phrase rather than a single effect. Half a second to a full second is fine.

**defeat.mp3** - The sound that plays if the player runs out of hearts. Should feel like a gentle letdown rather than a harsh failure buzzer, since a young player may hear this often while learning the game. About half a second.

**music-calm.mp3** - The background music bed that plays during ordinary exploration, when no enemy or boss is nearby. Should be a soft, toy-scale loop that can play continuously without becoming tiring, matching the deep navy and teal, cozy-adventure feeling of the game's visuals. This needs to loop seamlessly. Fifteen to thirty seconds is a reasonable loop length.

**music-intense.mp3** - A second music layer that blends in on top of the calm bed when an enemy or boss is close by, making the moment feel more urgent without changing the whole song. This should be more rhythmic and a little more tense than the calm bed, but still fit the same toy-scale world, not a sudden genre change. It also needs to loop seamlessly, and should be roughly the same length as the calm bed so the two can play together in sync.

## A note on how this works technically

The game keeps its own simple synthesized sound for every single one of these, generated directly in code with no file needed. Real files are entirely optional and additive. If you only ever provide three or four of these, the rest will keep using their built-in placeholder sound indefinitely, and the game will work correctly either way.
