# Third-party notices

## Counter-Strike item data and images

Counter-Strike 2 item names, item data and item images belong to Valve Corporation. Combo Skin is a fan project and is not affiliated with or endorsed by Valve. Finish images are loaded from Steam's image servers; none are stored in this repository.

## CSGO-API

The knife and glove catalog (`api/src/combo_api/catalog/snapshot.json` and `website/src/data/catalog.json`) is generated from [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API), an unofficial JSON dataset built from the game's files. It is used under the MIT licence:

```text
MIT License

Copyright (c) 2023 ByMykel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## SecLists

The list of common passwords that new admin passwords are checked against (`api/src/combo_api/admins/common_passwords.txt`) is derived from `Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt` in [danielmiessler/SecLists](https://github.com/danielmiessler/SecLists), at commit `68bcd12457978649d41ae4f56e3b5d2db2b72560`. Only the entries of 15 to 256 characters are kept, Unicode NFKC normalised, lowercased, deduplicated and sorted. It is used under the MIT licence:

```text
MIT License

Copyright (c) 2018 Daniel Miessler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
