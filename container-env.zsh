if [[ -r /proc/1/environ ]]; then
  while IFS= read -r -d '' __env_entry; do
    __env_name=${__env_entry%%=*}
    [[ $__env_name =~ '^[A-Za-z_][A-Za-z0-9_]*$' ]] || continue
    [[ -v $__env_name ]] && continue
    export "$__env_entry"
  done < /proc/1/environ
  unset __env_entry __env_name
fi
