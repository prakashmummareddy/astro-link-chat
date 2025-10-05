// supabase/functions/chat/index.ts
import { serve } from 'https://deno.land/std@0.178.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// Import your AI SDK here (e.g., OpenAI)
// For example, if using OpenAI:
// import OpenAI from 'https://deno.land/x/openai@v4.29.1/mod.ts'; // Adjust version as needed

// Initialize OpenAI client (replace with your actual API key and model)
// const openai = new OpenAI({
//   apiKey: Deno.env.get('OPENAI_API_KEY'), // Store your API key in Supabase secrets
// });

serve(async (req) => {
  try {
    const { message, profile_id, role } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    let aiResponseContent = "I'm here to listen. How else can I assist you?";
    let messageRouted = false;
    let recipientName = null;

    // --- Step 1.1: AI Intent Detection and Empathetic Response Generation ---
    // This is a simplified example. In a real scenario, you'd use an LLM.
    // You would send the user's message to your AI model to get a response
    // and potentially identify if it's meant for another person.

    // Example using a placeholder for AI interaction:
    // const aiPrompt = `The user, a ${role}, said: "${message}". Respond empathetically.
    // If the message seems intended for another person (e.g., "Tell my mom...", "Send to John..."),
    // also identify the intended recipient's name.
    // Format your response as JSON: { "ai_reply": "...", "intended_recipient_name": "..." (or null) }`;

    // const completion = await openai.chat.completions.create({
    //   model: "gpt-3.5-turbo", // Or your preferred model
    //   messages: [{ role: "user", content: aiPrompt }],
    //   response_format: { type: "json_object" }, // Request JSON output
    // });

    // const aiOutput = JSON.parse(completion.choices[0].message.content);
    // aiResponseContent = aiOutput.ai_reply;
    // const potentialRecipientName = aiOutput.intended_recipient_name;

    // --- Placeholder for AI logic (replace with actual LLM call) ---
    let potentialRecipientName: string | null = null;
    if (message.toLowerCase().includes("tell my mom")) {
      potentialRecipientName = "mom"; // Simplified detection
    } else if (message.toLowerCase().includes("tell my dad")) {
      potentialRecipientName = "dad";
    } else if (message.toLowerCase().includes("send to")) {
      const match = message.toLowerCase().match(/send to\s+([a-zA-Z\s]+)/);
      if (match && match[1]) {
        potentialRecipientName = match[1].trim();
      }
    }

    // Generate a basic empathetic response for now
    aiResponseContent = `Thank you for sharing that. I understand. ${potentialRecipientName ? `I'll see if I can help you connect with ${potentialRecipientName}.` : ''}`;
    // --- End Placeholder ---


    // --- Step 1.2: Message Routing Logic ---
    if (potentialRecipientName) {
      // Search for the intended recipient among connections
      const { data: connectionsData, error: connectionsError } = await supabaseClient
        .from("connections")
        .select(
          `
          id,
          status,
          requester:profiles!connections_requester_id_fkey(id, full_name, role, relationship, mission_name),
          requested:profiles!connections_requested_id_fkey(id, full_name, role, relationship, mission_name)
        `
        )
        .or(`requester_id.eq.${profile_id},requested_id.eq.${profile_id}`);

      if (connectionsError) {
        console.error("Error fetching connections:", connectionsError);
        aiResponseContent = "I encountered an issue checking your connections. Please try again.";
      } else {
        let foundRecipientProfile = null;

        for (const conn of connectionsData || []) {
          if (conn.status === "approved") {
            const otherUser = conn.requester.id === profile_id ? conn.requested : conn.requester;

            // Check if the other user's name or relationship matches the potential recipient
            const nameMatch = otherUser.full_name.toLowerCase().includes(potentialRecipientName.toLowerCase());
            const relationshipMatch = otherUser.relationship?.toLowerCase().includes(potentialRecipientName.toLowerCase());

            if (nameMatch || relationshipMatch) {
              foundRecipientProfile = otherUser;
              break;
            }
          }
        }

        if (foundRecipientProfile) {
          const recipientId = foundRecipientProfile.id;

          // Insert the message into the routed_messages table
          const { error: insertError } = await supabaseClient
            .from("routed_messages")
            .insert({
              sender_id: profile_id,
              recipient_id: recipientId,
              content: message, // The original user message
            });

          if (insertError) {
            console.error("Error inserting routed message:", insertError);
            aiResponseContent = "I tried to send your message, but there was an issue. Please try again.";
          } else {
            messageRouted = true;
            recipientName = foundRecipientProfile.full_name;
            aiResponseContent = `I've successfully routed your message to ${recipientName}. They will see it in their Message Center.`;
          }
        } else {
          aiResponseContent = `I couldn't find a connected person named or related to "${potentialRecipientName}". Please ensure you are connected with them.`;
        }
      }
    }

    // --- Step 1.3: Save AI Conversation (for the sender's chat history) ---
    await supabaseClient.from("ai_conversations").insert({
      user_id: profile_id,
      message: message,
      response: aiResponseContent,
    });

    return new Response(
      JSON.stringify({
        response: aiResponseContent,
        message_routed: messageRouted,
        recipient_name: recipientName,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message || "An unexpected error occurred." }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
})