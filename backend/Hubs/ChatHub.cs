using Microsoft.AspNetCore.SignalR;
using ThienPlan.Api.Data;

namespace ThienPlan.Api.Hubs;

public sealed class ChatHub(DemoStore store) : Hub
{
    public Task JoinConversation(Guid conversationId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, conversationId.ToString());

    public async Task SendMessage(Guid conversationId, Guid? senderId, string senderType, string content)
    {
        var message = new ChatMessageRecord(Guid.NewGuid(), conversationId, senderId, senderType, content, null, false, null, DateTimeOffset.UtcNow);
        lock (store.SyncRoot)
        {
            store.ChatMessages.Add(message);
            var conversation = store.Conversations.FirstOrDefault(x => x.Id == conversationId);
            if (conversation is not null)
            {
                conversation.LastMessageAt = message.CreatedAt;
            }
        }

        await Clients.Group(conversationId.ToString()).SendAsync("message:new", message);
    }
}
