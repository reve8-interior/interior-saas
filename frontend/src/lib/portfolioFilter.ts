interface HasRooms {
  rooms: string[];
}

/** Distinct room tags across designs, alphabetical. */
export function roomOptions(designs: HasRooms[]): string[] {
  return [...new Set(designs.flatMap((d) => d.rooms))].sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Designs tagged with `room`; an empty room means no filter. */
export function filterByRoom<T extends HasRooms>(
  designs: T[],
  room: string
): T[] {
  return room ? designs.filter((d) => d.rooms.includes(room)) : designs;
}
