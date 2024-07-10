const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const getOpenAIResponse = async (messages) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error getting response from OpenAI: ", error.message);
    return "Sorry, I couldn't process that request.";
  }
};

module.exports = { getOpenAIResponse };
