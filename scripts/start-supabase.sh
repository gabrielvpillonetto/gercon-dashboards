#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Uso: npm run supabase:start [-- --reset]"
  echo
  echo "Inicia o Supabase local. Use --reset para apagar e recriar o banco,"
  echo "aplicar as migrações e carregar o seed."
}

reset_database=false

for arg in "$@"; do
  case "$arg" in
    --reset)
      reset_database=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

npx supabase start

if [[ "$reset_database" == true ]]; then
  echo "Resetando o banco local; os dados locais existentes serão apagados."
  npx supabase db reset
fi

npx supabase status
