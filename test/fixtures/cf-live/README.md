# cf-live fixtures

`info-*.json` are answers of `GET {base}/info` from sites built from each prompt version.
They are frozen: sites built from those prompts are still running and nobody may rebuild
them, so the app must keep agreeing with every one of them. Never change or remove a file
here; add one for every new prompt version or protocol version.
