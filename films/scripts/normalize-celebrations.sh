#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 input.mp4 output.mp4" >&2
  exit 2
fi

input="$1"
output="$2"
analysis="$(ffmpeg -hide_banner -nostats -i "$input" -af loudnorm=I=-16:TP=-1:LRA=11:print_format=json -f null - 2>&1)"

readarray -t measured < <(printf '%s\n' "$analysis" | python3 -c 'import json,sys
text=sys.stdin.read(); start=text.rfind("{")
if start < 0: raise SystemExit("loudnorm analysis was not found")
data,_=json.JSONDecoder().raw_decode(text[start:])
for key in ("input_i","input_tp","input_lra","input_thresh","target_offset"): print(data[key])')

ffmpeg -y -i "$input" -c:v copy -af "loudnorm=I=-16:TP=-1:LRA=11:measured_I=${measured[0]}:measured_TP=${measured[1]}:measured_LRA=${measured[2]}:measured_thresh=${measured[3]}:offset=${measured[4]}:linear=true:print_format=summary" -c:a aac -b:a 192k "$output"