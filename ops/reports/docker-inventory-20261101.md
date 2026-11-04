# Sanitized deployment inventory

- Current work is in an existing linked worktree on the approved feature branch. Original user checkout and uncommitted SMM work are preserved.
- Repository visibility is PUBLIC. No credentials, real email addresses, database records, image TARs or private SSH configuration are in this report.
- Windows11 x64; WSL2; Docker Desktop installed with Linux context; CLI/Compose work, daemon requests time out. Existing local infra databases were not stopped or restarted.
- VPS: Ubuntu24.04 amd64;4CPU;~8GB RAM;~25GB disk free. Existing PostgreSQL18/Redis7 containers use private persistent mounts and loopback host ports.
- Live app is a coupled Web/API/VTT umbrella service plus host reverse proxy. Voice and webmail have separate routes; two Web/API images must retain them.
- Existing trusted SSH key was reused in a local-only alias with strict host checking. No key material copied to server or repository; no new root/Docker privilege granted.
- Provider readiness previously disagreed with file-based selection. Regression test reproduced it and shared email selection now uses explicit environment first; payment/payout precedence remains unchanged.
- Docker cutover is blocked on local Engine tests and the final reviewed routing/rollback plan. No Docker production cutover has occurred.
