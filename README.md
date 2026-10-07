# Language Translation Tool

A clean, responsive **web-based translation tool** that translates text between 43 languages in real time — with automatic language detection, one-click copy, text-to-speech, and a dark/light theme.

Built with **HTML5, CSS3, and JavaScript** only. No build step, no dependencies — just open the page and start translating.

---

## ✨ Features

- 🌍 **43 languages** — English, Spanish, Hindi, French, German, Japanese, Arabic, Chinese, Portuguese, Russian, and more
- 🔍 **Automatic language detection** — not sure of the source language? The tool identifies it for you
- ⚡ **Live translation** — results update automatically as you type (or press `Ctrl + Enter`)
- 🔁 **Language swap** — flip source and target instantly; the translated text moves back into the editor
- 📋 **Copy buttons** — copy the original text or the translation with one click
- 🔊 **Text-to-speech** — hear pronunciation in the source and target language
- 🌗 **Dark / light theme** — comfortable reading at any time of day
- 📱 **Fully responsive** — works on desktop, tablet, and mobile browsers
- 🧯 **Error handling** — automatic fallback between translation engines with clear status messages
- ⌨️ **Handy extras** — 5,000-character counter, sample phrases, clear button, `Ctrl + Enter` shortcut

## 🛠️ Technologies Used

| Technology | Version |
|------------|---------|
| HTML5      | Semantic markup, accessible forms & controls |
| CSS3       | Flexbox / Grid, variables, animations, dark mode |
| JavaScript | ES6+, `fetch`, Web Speech API, Local Storage |

Translation is powered by the **Google Translate API**, with an automatic fallback engine for reliability.

---

## 📁 Project Structure

```
Language-Translation-Tool/
│
├── index.html      # Landing page (hero, features, how it works, FAQ)
├── app.html        # The translator interface
│
├── style.css       # Shared design system, app layout, themes
├── landing.css     # Landing page styling
│
├── script.js       # Translation logic, API calls, copy & speech
├── landing.js      # Landing page behaviour (theme, animations)
│
└── README.md
```

---

## 🚀 How to Run

**No installation required. No build tools required. No commands required.**

1. Download or clone the repository
2. Open **`index.html`** in any modern web browser
3. Click **“Open the translator”** — done ✅

<details>
<summary>Optional: VS Code Live Server</summary>

For the smoothest development experience:

1. Install the **Live Server** extension in Visual Studio Code
2. Open the project folder
3. Right-click `index.html` → **Open with Live Server**
4. The app opens at `http://127.0.0.1:5500`

</details>

---

## 💻 Usage

1. **Enter text** — type or paste up to 5,000 characters in the left panel
2. **Choose languages** — pick the source language (or leave it on *Detect language*) and the target language
3. **Translate** — the translation appears on the right automatically; press the **Translate** button or `Ctrl + Enter` for an instant refresh
4. **Use the tools**
   - 📋 copy the source or the translation
   - 🔊 listen to either panel read aloud
   - 🔁 swap the two languages
   - 🌗 toggle dark mode

**Tip:** The landing page language chips open the translator with a language already selected — click one to try it instantly.

---

## 📌 Notes

- Works entirely client-side in the browser
- Your text is sent only to the translation service and is never stored
- Language preference and theme are remembered with Local Storage

---

## 🙏 Credits

**Author:** [Sujan Pronimath](https://github.com/sujanpronimath5-dot)

- Repository: [github.com/sujanpronimath5-dot/Language-Translation-Tool](https://github.com/sujanpronimath5-dot/Language-Translation-Tool)
- Translation data provided by the **Google Translate API**
- Fonts & icons: system fonts and native emoji — no external assets

If you find this project useful, consider giving it a ⭐ on GitHub.

---

## 📄 License

Free to use for learning and personal projects.
