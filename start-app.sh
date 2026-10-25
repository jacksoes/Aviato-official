#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/travel-agent"
BACKEND_DIR="$ROOT_DIR/travel-agent-backend"
AGENT_DIR="$ROOT_DIR/AI-agent"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
agent_member_args=()

while (($#)); do
  case "$1" in
    --add-members)
      shift
      member_values=()
      while (($#)) && [[ "$1" != --* ]]; do
        member_values+=("$1")
        shift
      done
      if ((${#member_values[@]} == 0)); then
        echo "--add-members requires E.164 numbers, such as +15551234567,+15557654321." >&2
        exit 1
      fi
      agent_member_args=(--add-members "${member_values[@]}")
      ;;
    --add-members=*)
      agent_member_args=(--add-members "${1#*=}")
      shift
      ;;
    *)
      echo "Unknown option: $1. Supported option: --add-members." >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Frontend dependencies are missing. Run 'npm install' in travel-agent first." >&2
  exit 1
fi
if ! command -v bun >/dev/null 2>&1; then
  echo "Bun was not found. Install Bun to run the TypeScript AI agent." >&2
  exit 1
fi

PYTHON="$BACKEND_DIR/.venv/Scripts/python.exe"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3 || command -v python || true)"
fi
if [[ -z "$PYTHON" ]]; then
  echo "Python was not found. Install Python or create travel-agent-backend/.venv first." >&2
  exit 1
fi

frontend_pid=""
backend_pid=""
agent_pid=""
cleanup() {
  trap - EXIT INT TERM
  [[ -z "$frontend_pid" ]] || kill "$frontend_pid" 2>/dev/null || true
  [[ -z "$backend_pid" ]] || kill "$backend_pid" 2>/dev/null || true
  [[ -z "$agent_pid" ]] || kill "$agent_pid" 2>/dev/null || true
  [[ -z "$frontend_pid" ]] || wait "$frontend_pid" 2>/dev/null || true
  [[ -z "$backend_pid" ]] || wait "$backend_pid" 2>/dev/null || true
  [[ -z "$agent_pid" ]] || wait "$agent_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Frontend: http://${FRONTEND_HOST}:${FRONTEND_PORT}"
echo "Django:   http://${BACKEND_HOST}:${BACKEND_PORT}/api/health/"
echo "AI agent: Bun process in AI-agent/ (requires its .env configuration)"
if ((${#agent_member_args[@]})); then
  echo "Startup group members: requested; will apply to the first supported iMessage group chat."
fi
echo "Press Ctrl+C to stop the frontend, backend, and AI agent."

(cd "$FRONTEND_DIR" && npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT") &
frontend_pid=$!
(cd "$BACKEND_DIR" && "$PYTHON" manage.py runserver "${BACKEND_HOST}:${BACKEND_PORT}") &
backend_pid=$!
if ((${#agent_member_args[@]})); then
  (cd "$AGENT_DIR" && bun run start -- "${agent_member_args[@]}") &
else
  (cd "$AGENT_DIR" && bun start) &
fi
agent_pid=$!

set +e
wait -n "$frontend_pid" "$backend_pid" "$agent_pid"
server_status=$?
set -e
if [[ $server_status -ne 0 ]]; then
  echo "One of the servers stopped with an error. Stopping the other server." >&2
fi
exit "$server_status"
