document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('api-key');
    const studyNotesInput = document.getElementById('study-notes');
    const generateBtn = document.getElementById('generate-btn');
    const resultsArea = document.getElementById('results');
    const downloadBtn = document.getElementById('download-btn');
    const loadingIndicator = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');

    const SYSTEM_PROMPT = `You are an expert university professor creating flashcards for a high-stakes exam. Extract the most critical, highly testable key points from the provided text. Keep the output in the same language as the input text.

Follow these rules for card quality:
1. Minimum Information Principle: Each card must test only ONE specific fact, mechanism, or concept. Break complex processes down into multiple atomic cards.
2. Exam Focus: Prioritize key enzymes, biomarkers, regulatory mechanisms, clinical correlates, and distinct structural differences.
3. Clarity: Frame the front as a clear, unambiguous question. Keep the back (answer) concise and punchy.

Follow these strict rules for formatting:
1. Format exactly as plain text.
2. Use a semicolon (;) to separate the Front from the Back (Format: Question;Answer).
3. Each card MUST be on its own new line.
4. ABSOLUTELY NO markdown formatting, headers, bold text, bullet points, or conversational filler.`;

    generateBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const studyNotes = studyNotesInput.value.trim();

        if (!apiKey) {
            showError("Please enter your Gemini API key.");
            return;
        }

        if (!studyNotes) {
            showError("Please enter some study notes.");
            return;
        }

        hideError();
        setLoading(true);
        resultsArea.value = '';
        downloadBtn.disabled = true;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [
                            { text: SYSTEM_PROMPT }
                        ]
                    },
                    contents: [
                        {
                            parts: [
                                { text: studyNotes }
                            ]
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

                resultsArea.value = generatedText;
                downloadBtn.disabled = false;
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
