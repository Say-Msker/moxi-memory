#!/usr/bin/env bash
# install.sh —— 在 macOS / Linux 上铺一套空的记忆库
# 用法：./install.sh ~/.memory
set -euo pipefail

TARGET="${1:-$HOME/.memory}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null || true)" ]; then
  echo "目标目录非空，拒绝覆盖：$TARGET" >&2
  echo "换一个目录，或先把它挪走。" >&2
  exit 1
fi

mkdir -p "$TARGET"/{identity,user,sea,skills,decisions,projects/active,projects/archive,concepts,archive,raw,tools}

# 模板：UTF-8 无 BOM、LF 行尾（CRLF 会让 frontmatter 解析整段失效）
for f in SOUL.md MEMORY.md index.md log.md anchors.md BOOTSTRAP.md; do
  cp "$SRC/template/$f" "$TARGET/$f"
  # 去掉可能存在的 BOM 与 CR
  perl -i -pe 's/^\x{FEFF}//; s/\r$//' "$TARGET/$f" 2>/dev/null || true
  echo "  写入 $f"
done

cp "$SRC/tools/decay.mjs" "$TARGET/tools/decay.mjs"
echo "  写入 tools/decay.mjs"

cat <<EOF

记忆根目录：$TARGET

下一步：
  1. 编辑 $TARGET/SOUL.md，把 <!-- ... --> 换成你自己的话
  2. 自检：node "$TARGET/tools/decay.mjs" --lifecycle --dry-run
  3. 若用 dsh-plugin-memory：确认插件指向该目录，再跑一次 dsh-memory lint
EOF
