export function generateRoomId(): string {
  const character = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (var i = 0; i < 4; i++) {
    result =
      result + character.charAt(Math.floor(Math.random() * character.length));
  }
  return result;
}
export function getNextActivePlayerId(players: any[], currentId: string) {
  const currentIndex = players.findIndex((p) => p.id === currentId);
  if (currentIndex === -1) return players.find((player) => !player.isEliminated)?.id ?? currentId;
  let nextIndex = (currentIndex + 1) % players.length;
  while (players[nextIndex].isEliminated && nextIndex !== currentIndex) {
    nextIndex = (nextIndex + 1) % players.length;
  }
  return players[nextIndex].id;
}
