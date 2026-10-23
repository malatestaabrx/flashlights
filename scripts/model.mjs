export const STALE_MS = 2500;
export const INTERPOLATION_MS = 80;

export function canIlluminate(user, playerPermissions = {}, gmLight = false) {
  if (!user) return false;
  if (user.isGM) return gmLight;
  return !Object.hasOwn(playerPermissions, user.id) || playerPermissions[user.id] !== false;
}

export function contains(rect, point) {
  return !!rect && !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= rect.x && point.y >= rect.y
    && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
}

export function interpolate(beam, now) {
  const t = Math.max(0, Math.min(1, (now - beam.received) / INTERPOLATION_MS));
  return { x: beam.from.x + (beam.to.x - beam.from.x) * t,
    y: beam.from.y + (beam.to.y - beam.from.y) * t };
}

export class BeamStore {
  beams = new Map();

  receive(message, { sceneId, levelId, rect, users, ownId, gmLight, playerPermissions = {}, now }) {
    if (!message || message.v !== 1 || message.userId === ownId
      || message.sceneId !== sceneId || message.levelId !== levelId) return false;
    const user = users.get(message.userId);
    if (!user?.active || !canIlluminate(user, playerPermissions, gmLight)) return false;
    if (message.type === "hide") return this.beams.delete(message.userId);
    if (message.type !== "move" || !contains(rect, message)) return false;
    const previous = this.beams.get(message.userId);
    const to = { x: message.x, y: message.y };
    this.beams.set(message.userId, {
      from: previous ? interpolate(previous, now) : to, to, received: now
    });
    return true;
  }

  prune(users, now, gmLight, playerPermissions = {}) {
    let changed = false;
    for (const [id, beam] of this.beams) {
      const user = users.get(id);
      if (!user?.active || !canIlluminate(user, playerPermissions, gmLight) || now - beam.received > STALE_MS) {
        this.beams.delete(id);
        changed = true;
      }
    }
    return changed;
  }
}
