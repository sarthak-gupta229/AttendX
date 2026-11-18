let activeConnections = 0;

export function incrementConnections(): number {
  return ++activeConnections;
}

export function decrementConnections(): number {
  if (activeConnections > 0) {
    activeConnections--;
  }
  return activeConnections;
}

export function getConnectionCount(): number {
  return activeConnections;
}
