document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('api-key');
    const modelSelectInput = document.getElementById('model-select');
    const cardTypeSelectInput = document.getElementById('card-type-select');
    const studyNotesInput = document.getElementById('study-notes');
    const imageUploadInput = document.getElementById('image-upload');
    const includeImageCheckbox = document.getElementById('include-image');
    const generateBtn = document.getElementById('generate-btn');
    const resultsArea = document.getElementById('results');
    const downloadBtn = document.getElementById('download-btn');
    const copyBtn = document.getElementById('copy-btn');
    const loadingIndicator = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');

    // Load saved data from localStorage
    if (localStorage.getItem('ankiGen_apiKey')) {
        apiKeyInput.value = localStorage.getItem('ankiGen_apiKey');
    }
    if (localStorage.getItem('ankiGen_studyNotes')) {
        studyNotesInput.value = localStorage.getItem('ankiGen_studyNotes');
    }

    // Save data to localStorage on input
    apiKeyInput.addEventListener('input', () => {
        localStorage.setItem('ankiGen_apiKey', apiKeyInput.value);
    });
    studyNotesInput.addEventListener('input', () => {
        localStorage.setItem('ankiGen_studyNotes', studyNotesInput.value);
    });

    const IMAGE_PROMPT_ADDITION = `
If requested, also output exactly ONE search query for a relevant diagram at the very end of your response, formatted exactly like this on its own line:
[SEARCH_QUERY: <your search query here>]
`;

    const SYSTEM_PROMPT_BASIC = `You are an expert university professor creating flashcards for a high-stakes exam. Extract the most critical, highly testable key points from the provided text. Keep the output in the same language as the input text.

Follow these rules for card quality:
1. Minimum Information Principle: Each card must test only ONE specific fact, mechanism, or concept. Break complex processes down into multiple atomic cards.
2. Exam Focus: Prioritize key enzymes, biomarkers, regulatory mechanisms, clinical correlates, and distinct structural differences.
3. Clarity: Frame the front as a clear, unambiguous question. Keep the back (answer) concise and punchy.

Follow these strict rules for formatting:
1. Format exactly as plain text.
2. Use a semicolon (;) to separate the Front from the Back (Format: Question;Answer).
3. Each card MUST be on its own new line.
4. ABSOLUTELY NO markdown formatting, headers, bold text, bullet points, or conversational filler.`;

    const SYSTEM_PROMPT_CLOZE = `You are an expert university professor creating flashcards for a high-stakes exam. Extract the most critical, highly testable key points from the provided text. Keep the output in the same language as the input text.

Follow these rules for card quality:
1. Minimum Information Principle: Each card must test only ONE specific fact, mechanism, or concept. Break complex processes down into multiple atomic cards.
2. Exam Focus: Prioritize key enzymes, biomarkers, regulatory mechanisms, clinical correlates, and distinct structural differences.
3. Clarity: Frame the statement clearly. Use Anki's cloze deletion format for the key fact.

Follow these strict rules for formatting:
1. Format exactly as plain text.
2. Use a semicolon (;) to separate the Text from any Extra information. If there is no extra info, leave the right side of the semicolon blank (Format: Text containing {{c1::cloze}};Extra optional info). Example: The powerhouse of the cell is the {{c1::mitochondria}}.;
3. Each card MUST be on its own new line.
4. ABSOLUTELY NO markdown formatting, headers, bold text, bullet points, or conversational filler.`;


    // Helper function to read file as base64
    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });

    generateBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const selectedModel = modelSelectInput.value;
        const selectedCardType = cardTypeSelectInput.value;
        const studyNotes = studyNotesInput.value.trim();
        const imageFile = imageUploadInput.files[0];
        const includeImage = includeImageCheckbox.checked;

        let currentPrompt = selectedCardType === 'cloze' ? SYSTEM_PROMPT_CLOZE : SYSTEM_PROMPT_BASIC;
        if (includeImage) {
            currentPrompt += IMAGE_PROMPT_ADDITION;
        }

        if (!apiKey) {
            showError("Please enter your Gemini API key.");
            return;
        }

        if (!studyNotes && !imageFile) {
            showError("Please enter some study notes or upload an image.");
            return;
        }

        hideError();
        setLoading(true);
        resultsArea.value = '';
        downloadBtn.disabled = true;
        copyBtn.disabled = true;
        copyBtn.textContent = 'Copy to Clipboard';

        try {
            let requestParts = [];
            if (studyNotes) {
                requestParts.push({ text: studyNotes });
            }
            if (imageFile) {
                const base64Data = await fileToBase64(imageFile);
                requestParts.push({
                    inline_data: {
                        mime_type: imageFile.type,
                        data: base64Data
                    }
                });
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [
                            { text: currentPrompt }
                        ]
                    },
                    contents: [
                        {
                            parts: requestParts
                        }
                    ],
                    generationConfig: {
                        responseMimeType: "text/plain"
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts.length > 0) {
                let generatedText = data.candidates[0].content.parts[0].text;
                // Basic cleanup just in case there are surrounding quotes or markdown block markers if the model ignores instructions
                generatedText = generatedText.replace(/^```[\s\S]*?\n/g, '').replace(/```$/g, '').trim();

                if (includeImage) {
                    const queryMatch = generatedText.match(/\[SEARCH_QUERY:\s*(.*?)\]/i);
                    let imageUrl = '';
                    if (queryMatch && queryMatch[1]) {
                        const query = queryMatch[1].trim();
                        // Remove the tag from the text
                        generatedText = generatedText.replace(/\[SEARCH_QUERY:\s*(.*?)\]/i, '').trim();

                        try {
                            const wikiResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=${encodeURIComponent(query)}&origin=*`);
                            const wikiData = await wikiResponse.json();
                            const pages = wikiData.query?.pages;
                            if (pages) {
                                const pageId = Object.keys(pages)[0];
                                if (pageId !== '-1' && pages[pageId].original && pages[pageId].original.source) {
                                    imageUrl = pages[pageId].original.source;
                                }
                            }
                        } catch (e) {
                            console.error("Image fetch failed", e);
                        }
                    }

                    if (imageUrl) {
                        // Append the image to the front of every generated card
                        const lines = generatedText.split('\n');
                        const updatedLines = lines.map(line => {
                            if (!line.trim()) return line;
                            const parts = line.split(';');
                            if (parts.length >= 1) {
                                parts[0] = parts[0] + ` <img src="${imageUrl}">`;
                            }
                            return parts.join(';');
                        });
                        generatedText = updatedLines.join('\n');
                    }
                }

                resultsArea.value = generatedText;
                downloadBtn.disabled = false;
                copyBtn.disabled = false;
            } else {
                throw new Error("Invalid response format from Gemini API.");
            }

        } catch (error) {
            console.error("Error generating cards:", error);
            showError(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    });

    downloadBtn.addEventListener('click', () => {
        const text = resultsArea.value;
        if (!text) return;

        const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'anki_cards.csv';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    });

    copyBtn.addEventListener('click', async () => {
        const text = resultsArea.value;
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            showError('Failed to copy text to clipboard.');
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';
    }

    function setLoading(isLoading) {
        if (isLoading) {
            loadingIndicator.classList.remove('hidden');
            generateBtn.disabled = true;
        } else {
            loadingIndicator.classList.add('hidden');
            generateBtn.disabled = false;
        }
    }
});
