#!/bin/bash
# SessionStart hook — TEMPLATE repo-agnóstico.
# Materializa en .claude/skills/ las skills compartidas listadas en
# .claude/skills.txt, bajándolas del repo central vicentedomus/claude-skills
# (una carpeta por skill, con SKILL.md + scripts/ + references/ + …).
#
# Cópialo a .claude/hooks/sync-skills.sh en el repo consumidor y regístralo como
# SessionStart en .claude/settings.json (ver el README de claude-skills, sección
# "Cableado del sync de skills en cualquier repo"). Los únicos knobs son las
# variables de arriba y .claude/skills.txt.
#
# CÓMO SE BAJA EL REPO (doble transporte; la política de red varía entre entornos):
#   1. git clone (shallow) vía el relay del entorno, CON REINTENTO — funciona
#      incluso donde codeload da 403 (se observó que el relay autoriza el repo y
#      codeload está bloqueado host-wide; la premisa vieja "relay 403, codeload
#      pasa" quedó INVERTIDA en esos entornos). Trae el árbol completo con assets.
#   2. Fallback en la NUBE: TARBALL de codeload por HTTPS (para entornos donde el
#      relay sí esté scopeado y codeload pase). El repo debe ser PÚBLICO (sin auth).
#   3. Último recurso: baja cada SKILL.md por curl a raw.github (SIN assets) para
#      que la skill siga cargando aunque 1 y 2 fallen.
#
# El JSON del hook es lo ÚNICO en stdout → todos los logs van a stderr. Al final
# emite reloadSkills:true para que Claude Code cargue las skills en ESTA sesión
# (clave en la web, donde el contenedor se re-clona limpio en cada sesión).

# ── Knobs ────────────────────────────────────────────────────────────────────
OWNER="vicentedomus"
REPO="claude-skills"
REF="main"
# ─────────────────────────────────────────────────────────────────────────────

REPO_URL="https://github.com/$OWNER/$REPO.git"
TARBALL_URL="https://codeload.github.com/$OWNER/$REPO/tar.gz/refs/heads/$REF"
RAW_URL="https://raw.githubusercontent.com/$OWNER/$REPO/$REF"
SKILLS_DIR="$CLAUDE_PROJECT_DIR/.claude/skills"
SKILLS_TXT="$CLAUDE_PROJECT_DIR/.claude/skills.txt"

log() { echo "$@" >&2; }

skills=$(grep -v '^\s*#' "$SKILLS_TXT" 2>/dev/null | grep -v '^\s*$')
[ -z "$skills" ] && exit 0

mkdir -p "$SKILLS_DIR"
materialized=0

# Copia (cp -a, preservando permisos / bit ejecutable) cada skill listada desde un
# árbol ya extraído del repo (raíz con una carpeta por skill).
materialize_from() {
  local src="$1"
  for skill in $skills; do
    if [ -d "$src/$skill" ]; then
      rm -rf "$SKILLS_DIR/$skill"           # limpia la versión previa → sin huérfanos
      cp -a "$src/$skill" "$SKILLS_DIR/$skill"
      materialized=$((materialized + 1))
      log "✓ $skill"
    else
      log "✗ $skill (no encontrada en $OWNER/$REPO)"
    fi
  done
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# git clone --depth 1 con hasta 3 intentos: el relay puede fallar transitoriamente
# en el cold-start de la sesión ("no caliente"), y ahí el reintento lo rescata.
clone_retry() {
  local n=0
  until git clone --quiet --depth 1 --branch "$REF" "$REPO_URL" "$1" 2>/dev/null; do
    n=$((n + 1)); [ "$n" -ge 3 ] && return 1; sleep "$n"
  done
}

# Transporte 1: git clone vía el relay (trae assets; funciona donde codeload da 403).
if clone_retry "$TMP/clone"; then
  materialize_from "$TMP/clone"
# Transporte 2 (fallback de nube): tarball de codeload.
elif [ "$CLAUDE_CODE_REMOTE" = "true" ] \
     && curl -sSL --max-time 120 "$TARBALL_URL" -o "$TMP/cs.tar.gz" \
     && tar -xzf "$TMP/cs.tar.gz" -C "$TMP" --strip-components=1 2>/dev/null; then
  materialize_from "$TMP"
else
  log "⚠ sync-skills: git clone (con reintento) y codeload fallaron"
fi

# Último recurso: si la vía principal no materializó nada, baja cada SKILL.md por
# curl (sin assets). Si tampoco hay red, respeta cualquier copia previa en disco.
if [ "$materialized" -eq 0 ]; then
  log "⚠ sync-skills: fallback a curl de SKILL.md por skill"
  for skill in $skills; do
    tmp="$(mktemp)"
    if curl -sf "$RAW_URL/$skill/SKILL.md" -o "$tmp" && [ -s "$tmp" ]; then
      mkdir -p "$SKILLS_DIR/$skill"
      mv "$tmp" "$SKILLS_DIR/$skill/SKILL.md"
      materialized=$((materialized + 1))
      log "✓ $skill (solo SKILL.md, sin assets)"
    else
      rm -f "$tmp"
      [ -f "$SKILLS_DIR/$skill/SKILL.md" ] \
        && { materialized=$((materialized + 1)); log "✓ $skill (copia previa en disco)"; } \
        || log "✗ $skill (sin red y sin copia local)"
    fi
  done
fi

# Solo forzamos re-escaneo si materializamos algo. Único contenido en stdout.
if [ "$materialized" -gt 0 ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","reloadSkills":true}}\n'
fi
exit 0
