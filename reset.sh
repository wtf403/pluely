#!/usr/bin/env bash
# Pluely Dev Pro unlock — macOS + Windows (Git Bash) + WSL
# Installs dependencies, patches DB, installs proxy as a persistent service,
# trusts the CA cert, and launches Pluely.
set -e

# ── detect OS ────────────────────────────────────────────────────────────────
case "$(uname -s)" in
  Darwin)
    OS=mac
    DB="$HOME/Library/Application Support/com.srikanthnani.pluely/pluely.db"
    MITM_SCRIPT="$HOME/.pluely-mitm.py"
    MITM_LOG="$HOME/.pluely-mitm.log"
    APP="/Applications/Pluely.app/Contents/MacOS/pluely"
    PLIST="$HOME/Library/LaunchAgents/com.pluely.proxy.plist"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    OS=win
    DB="$APPDATA/com.srikanthnani.pluely/pluely.db"
    MITM_SCRIPT="$APPDATA/pluely-mitm.py"
    MITM_LOG="$TEMP/pluely-mitm.log"
    APP="$LOCALAPPDATA/Programs/Pluely/Pluely.exe"
    TASK_XML="$TEMP/pluely-proxy-task.xml"
    ;;
  Linux)
    OS=wsl
    WIN_APPDATA="$(wslpath "$(cmd.exe /c 'echo %APPDATA%' 2>/dev/null | tr -d '\r')" 2>/dev/null || echo '')"
    DB="${WIN_APPDATA}/com.srikanthnani.pluely/pluely.db"
    MITM_SCRIPT="$HOME/.pluely-mitm.py"
    MITM_LOG="$HOME/.pluely-mitm.log"
    APP=""
    ;;
  *)
    echo "Unsupported OS: $(uname -s)"; exit 1 ;;
esac

# ── helpers ──────────────────────────────────────────────────────────────────
die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "  → $*"; }
ok()   { echo "  ✓ $*"; }

# ── dependency install ───────────────────────────────────────────────────────
install_sqlite_mac() {
  if command -v sqlite3 &>/dev/null; then ok "sqlite3 already installed"; return; fi
  info "Installing sqlite3 via Homebrew..."
  if ! command -v brew &>/dev/null; then
    info "Homebrew not found — installing Homebrew first..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  brew install sqlite
}

install_sqlite_win() {
  command -v sqlite3 &>/dev/null && { ok "sqlite3 already installed"; return; }
  info "sqlite3 not found."
  info "Download from https://sqlite.org/download.html (sqlite-tools-win-x64)"
  info "Extract sqlite3.exe to C:\\Windows\\System32\\ or any folder on PATH"
  die "Install sqlite3 and re-run this script"
}

install_mitmproxy_mac() {
  if command -v mitmdump &>/dev/null; then ok "mitmproxy already installed"; return; fi
  info "Installing mitmproxy..."
  if command -v brew &>/dev/null; then
    brew install mitmproxy
  elif command -v pip3 &>/dev/null; then
    pip3 install --user mitmproxy
  else
    die "Neither brew nor pip3 found. Install Python 3 or Homebrew first."
  fi
}

install_mitmproxy_win() {
  if command -v mitmdump &>/dev/null; then ok "mitmproxy already installed"; return; fi
  info "Installing mitmproxy via pip..."
  if command -v pip &>/dev/null; then
    pip install mitmproxy
  elif command -v pip3 &>/dev/null; then
    pip3 install mitmproxy
  elif command -v python &>/dev/null; then
    python -m pip install mitmproxy
  else
    info "Python/pip not found."
    info "1. Install Python from https://python.org/downloads (check 'Add to PATH')"
    info "2. Then run: pip install mitmproxy"
    die "Install Python + mitmproxy and re-run"
  fi
}

install_mitmproxy_wsl() {
  if command -v mitmdump &>/dev/null; then ok "mitmproxy already installed"; return; fi
  info "Installing mitmproxy via pip..."
  if command -v pip3 &>/dev/null; then
    pip3 install --user mitmproxy
  elif command -v apt-get &>/dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y python3-pip
    pip3 install --user mitmproxy
  else
    die "pip3 not found. Run: sudo apt install python3-pip && pip3 install mitmproxy"
  fi
}

check_and_install_deps() {
  echo ""
  echo "── checking dependencies ───────────────────────────────────────"
  case $OS in
    mac)
      install_sqlite_mac
      install_mitmproxy_mac
      ;;
    win)
      install_sqlite_win
      install_mitmproxy_win
      ;;
    wsl)
      install_mitmproxy_wsl
      # sqlite3 for WSL to patch Windows-side DB
      if ! command -v sqlite3 &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y sqlite3
      fi
      ;;
  esac
  ok "All dependencies satisfied"
}

# ── DB patch ─────────────────────────────────────────────────────────────────
patch_db() {
  echo ""
  echo "── patching database ───────────────────────────────────────────"
  [[ -f "$DB" ]] || die "pluely.db not found at:\n  $DB\n  Launch Pluely once so it creates the database, then re-run."
  sqlite3 "$DB" \
    "INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('license_active','true',datetime('now'));
     INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('license_is_dev','true',datetime('now'));"
  ok "license_active = true"
  ok "license_is_dev = true"
}

# ── mitmproxy intercept script ───────────────────────────────────────────────
write_mitm_script() {
  cat > "$MITM_SCRIPT" << 'PYTHON'
from mitmproxy import http
import json, time

def request(flow: http.HTTPFlow):
    if "pluely.com" not in flow.request.pretty_host:
        return
    path = flow.request.path
    now  = str(int(time.time()))
    if "validate" in path:
        flow.response = http.Response.make(200, json.dumps({
            "is_active": True, "last_validated_at": now,
            "is_dev_license": True, "models": []
        }), {"Content-Type": "application/json"})
    elif "activate" in path:
        flow.response = http.Response.make(200, json.dumps({
            "activated": True, "error": None,
            "license_key": "PLUELY-DEV-0000-0000-0000",
            "instance": {"id": "local-instance", "name": "local",
                         "created_at": "2024-01-01T00:00:00Z"},
            "is_active": True, "is_dev_license": True
        }), {"Content-Type": "application/json"})
    elif "deactivate" in path:
        flow.response = http.Response.make(200,
            json.dumps({"success": True}),
            {"Content-Type": "application/json"})
    elif any(k in path for k in ("license", "payment", "checkout")):
        flow.response = http.Response.make(200,
            json.dumps({"success": True, "is_active": True, "is_dev_license": True}),
            {"Content-Type": "application/json"})
PYTHON
  ok "Proxy intercept script written"
}

# ── CA cert trust ─────────────────────────────────────────────────────────────
trust_ca_mac() {
  local cert="$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
  if [[ ! -f "$cert" ]]; then
    info "Generating mitmproxy CA cert (running mitmdump briefly)..."
    mitmdump --quiet &
    MPID=$!
    sleep 2
    kill $MPID 2>/dev/null
    wait $MPID 2>/dev/null || true
  fi
  if [[ -f "$cert" ]]; then
    security add-trusted-cert -r trustRoot \
      -k "$HOME/Library/Keychains/login.keychain-db" "$cert" 2>/dev/null \
      && ok "CA cert trusted in login keychain" \
      || ok "CA cert already trusted"
  else
    info "Warning: CA cert not found at $cert — TLS interception may fail"
  fi
}

trust_ca_win() {
  # Generate cert first if needed
  local cert
  cert="$(python -c "import pathlib; print(pathlib.Path.home() / '.mitmproxy' / 'mitmproxy-ca-cert.p12')" 2>/dev/null || echo "$APPDATA/.mitmproxy/mitmproxy-ca-cert.p12")"
  local pem_cert
  pem_cert="${cert//.p12/.pem}"

  if [[ ! -f "$pem_cert" ]]; then
    info "Generating mitmproxy CA cert..."
    mitmdump --quiet &
    MPID=$!
    sleep 3
    kill $MPID 2>/dev/null
    wait $MPID 2>/dev/null || true
  fi

  if [[ -f "$pem_cert" ]]; then
    # Use certutil to install into Windows trust store
    certutil -addstore -user Root "$(cygpath -w "$pem_cert")" 2>/dev/null \
      && ok "CA cert trusted in Windows user certificate store" \
      || info "Warning: certutil failed — manually trust $pem_cert if TLS errors occur"
  fi
}

# ── launchd service (macOS) ──────────────────────────────────────────────────
install_service_mac() {
  echo ""
  echo "── installing launchd service ──────────────────────────────────"

  MITMDUMP_PATH="$(command -v mitmdump)"

  cat > "$PLIST" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.pluely.proxy</string>

  <key>ProgramArguments</key>
  <array>
    <string>${MITMDUMP_PATH}</string>
    <string>-p</string>
    <string>8080</string>
    <string>-s</string>
    <string>${MITM_SCRIPT}</string>
    <string>--ssl-insecure</string>
    <string>--quiet</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>

  <key>StandardOutPath</key>
  <string>${MITM_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${MITM_LOG}</string>

  <!-- start at login, restart if it crashes -->
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
PLIST_EOF

  # Unload first if already loaded
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
  ok "launchd service installed: com.pluely.proxy"
  ok "Proxy will auto-start at every login"
  ok "Plist: $PLIST"
}

# ── Task Scheduler service (Windows) ────────────────────────────────────────
install_service_win() {
  echo ""
  echo "── installing Task Scheduler task ──────────────────────────────"

  MITMDUMP_PATH="$(command -v mitmdump | xargs cygpath -w 2>/dev/null || command -v mitmdump)"
  MITM_SCRIPT_WIN="$(cygpath -w "$MITM_SCRIPT" 2>/dev/null || echo "$MITM_SCRIPT")"
  MITM_LOG_WIN="$(cygpath -w "$MITM_LOG" 2>/dev/null || echo "$MITM_LOG")"

  cat > "$TASK_XML" << TASK_EOF
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Pluely license proxy — intercepts validate/activate calls</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
    <Enabled>true</Enabled>
  </Settings>
  <Actions>
    <Exec>
      <Command>${MITMDUMP_PATH}</Command>
      <Arguments>-p 8080 -s "${MITM_SCRIPT_WIN}" --ssl-insecure --quiet</Arguments>
    </Exec>
  </Actions>
</Task>
TASK_EOF

  local task_xml_win
  task_xml_win="$(cygpath -w "$TASK_XML" 2>/dev/null || echo "$TASK_XML")"

  # Delete old task if exists, then create new one
  schtasks //Delete //TN "PluelyProxy" //F 2>/dev/null || true
  schtasks //Create //TN "PluelyProxy" //XML "$task_xml_win" //F \
    && ok "Task Scheduler task installed: PluelyProxy" \
    && ok "Proxy will auto-start at every login" \
    || die "schtasks failed — try running this script as Administrator"

  # Start it now
  schtasks //Run //TN "PluelyProxy" 2>/dev/null && ok "Proxy started" || true
}

# ── launch Pluely ─────────────────────────────────────────────────────────────
launch_app() {
  echo ""
  echo "── launching Pluely ────────────────────────────────────────────"

  if [[ -z "$APP" || ! -x "$APP" ]]; then
    info "App binary not found at: $APP"
    info "The DB is patched — launch Pluely manually."
    return
  fi

  pkill -f "Pluely" 2>/dev/null || true
  sleep 0.5

  HTTPS_PROXY=http://127.0.0.1:8080 HTTP_PROXY=http://127.0.0.1:8080 \
    "$APP" > /tmp/pluely-app.log 2>&1 &
  ok "Pluely launched (PID $!)"
}

# ── uninstall ────────────────────────────────────────────────────────────────
uninstall() {
  echo "── uninstalling Pluely proxy service ───────────────────────────"
  case $OS in
    mac)
      launchctl unload "$PLIST" 2>/dev/null && ok "launchd service unloaded" || true
      rm -f "$PLIST" && ok "Plist removed" || true
      rm -f "$MITM_SCRIPT" && ok "Proxy script removed" || true
      ;;
    win)
      schtasks //Delete //TN "PluelyProxy" //F 2>/dev/null && ok "Task removed" || true
      rm -f "$MITM_SCRIPT" && ok "Proxy script removed" || true
      ;;
  esac
  echo "Done. DB patch is NOT reverted — Pluely will call home on next launch."
}

# ── main ─────────────────────────────────────────────────────────────────────
case "${1:-}" in
  --uninstall) uninstall; exit 0 ;;
esac

echo "========================================"
echo " Pluely Dev Pro unlock"
echo " OS: $OS"
echo "========================================"

check_and_install_deps
patch_db
write_mitm_script

case $OS in
  mac)
    trust_ca_mac
    install_service_mac
    launch_app
    ;;
  win)
    trust_ca_win
    install_service_win
    launch_app
    ;;
  wsl)
    info "WSL detected — DB patched on Windows side."
    info "For the proxy service, run unlock.sh inside Git Bash on Windows."
    ;;
esac

echo ""
echo "========================================"
echo " All done — Dev Pro unlocked"
echo " Proxy runs automatically at every login"
echo " To uninstall: bash unlock.sh --uninstall"
echo "========================================"
