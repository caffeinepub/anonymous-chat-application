import Map "mo:core/Map";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Storage "blob-storage/Storage";
import Runtime "mo:core/Runtime";
import Iter "mo:core/Iter";
import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";
import Array "mo:core/Array";



actor {
  let accessControlState = AccessControl.initState();
  include MixinStorage();
  include MixinAuthorization(accessControlState);

  type ChatRoom = {
    joinCode : Text;
    createdAt : Time.Time;
  };

  type Message = {
    id : Nat;
    content : Text;
    timestamp : Time.Time;
    nickname : Text;
    replyToId : ?Nat;
    imageUrl : ?Storage.ExternalBlob;
    videoUrl : ?Storage.ExternalBlob;
    audioUrl : ?Storage.ExternalBlob;
    isEdited : Bool;
    reactions : List.List<Reaction>;
    owner : Text;
  };

  public type MessageView = {
    id : Nat;
    content : Text;
    timestamp : Time.Time;
    nickname : Text;
    replyToId : ?Nat;
    imageUrl : ?Storage.ExternalBlob;
    videoUrl : ?Storage.ExternalBlob;
    audioUrl : ?Storage.ExternalBlob;
    isEdited : Bool;
    reactions : [Reaction];
  };

  public type Reaction = {
    userId : Text;
    emoji : Text;
  };

  public type UserProfile = {
    nickname : Text;
  };

  let messageTTL : Time.Time = 24 * 60 * 60 * 1_000_000_000;
  var nextMessageId : Nat = 0;

  let chatRooms = Map.empty<Text, ChatRoom>();
  let messages = Map.empty<Text, List.List<Message>>();
  let userProfiles = Map.empty<Text, UserProfile>();

  func ensureRoomMessages(roomId : Text) : List.List<Message> {
    switch (messages.get(roomId)) {
      case (null) {
        let emptyList = List.empty<Message>();
        messages.add(roomId, emptyList);
        emptyList;
      };
      case (?msgs) { msgs };
    };
  };

  // Generate unique message IDs
  func nextId() : Nat {
    let id = nextMessageId;
    nextMessageId += 1;
    id;
  };

  // Anyone can create a room (anonymous chat feature)
  public shared ({ caller }) func createRoom(joinCode : Text) : async Text {
    if (chatRooms.containsKey(joinCode)) {
      Runtime.trap("Room already exists");
    };

    let newRoom : ChatRoom = {
      joinCode;
      createdAt = Time.now();
    };
    chatRooms.add(joinCode, newRoom);
    joinCode;
  };

  func isNotExpired(message : Message) : Bool {
    let currentTime = Time.now();
    (currentTime - message.timestamp) <= messageTTL;
  };

  func convertMessageToView(message : Message) : MessageView {
    {
      id = message.id;
      content = message.content;
      timestamp = message.timestamp;
      nickname = message.nickname;
      replyToId = message.replyToId;
      imageUrl = message.imageUrl;
      videoUrl = message.videoUrl;
      audioUrl = message.audioUrl;
      isEdited = message.isEdited;
      reactions = message.reactions.toArray();
    };
  };

  // Anyone can read messages in a room (anonymous chat feature)
  public query ({ caller }) func getMessages(roomId : Text) : async [MessageView] {
    switch (messages.get(roomId)) {
      case (null) { [] };
      case (?msgs) {
        let filteredMsgs = msgs.filter(isNotExpired);
        filteredMsgs.map<Message, MessageView>(convertMessageToView).toArray();
      };
    };
  };

  // Anyone can send messages (anonymous chat feature)
  // userId should be a session-based identifier from the frontend (e.g., UUID stored in localStorage)
  public shared ({ caller }) func sendMessage(
    roomId : Text,
    content : Text,
    nickname : Text,
    userId : Text,
    replyToId : ?Nat,
    image : ?Storage.ExternalBlob,
    video : ?Storage.ExternalBlob,
    audio : ?Storage.ExternalBlob,
  ) : async Nat {
    if (chatRooms.get(roomId) == null) {
      Runtime.trap("Room does not exist");
    };

    let messageId = nextId();

    let newMessage : Message = {
      id = messageId;
      content;
      timestamp = Time.now();
      nickname;
      replyToId;
      imageUrl = image;
      videoUrl = video;
      audioUrl = audio;
      isEdited = false;
      reactions = List.empty<Reaction>();
      owner = userId;
    };

    let roomMessages = ensureRoomMessages(roomId);
    roomMessages.add(newMessage);

    messageId;
  };

  // Only message owner can edit their own message
  // userId must match the owner field set during sendMessage
  public shared ({ caller }) func editMessage(
    roomId : Text,
    messageId : Nat,
    userId : Text,
    newContent : Text,
    newImage : ?Storage.ExternalBlob,
    newVideo : ?Storage.ExternalBlob,
    newAudio : ?Storage.ExternalBlob,
  ) : async Bool {
    switch (messages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        switch (msgs.find(func(msg) { msg.id == messageId })) {
          case (null) { false };
          case (?targetMsg) {
            if (targetMsg.owner != userId) {
              Runtime.trap("Unauthorized: You can only edit your own messages");
            };

            let updatedMessages = msgs.map<Message, Message>(
              func(msg) {
                if (msg.id == messageId) {
                  {
                    msg with
                    content = newContent;
                    isEdited = true;
                    imageUrl = newImage;
                    videoUrl = newVideo;
                    audioUrl = newAudio;
                  };
                } else {
                  msg;
                };
              }
            );
            messages.add(roomId, updatedMessages);
            true;
          };
        };
      };
    };
  };

  // Only message owner can delete their own message
  // userId must match the owner field set during sendMessage
  public shared ({ caller }) func deleteMessage(roomId : Text, messageId : Nat, userId : Text) : async Bool {
    switch (messages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        switch (msgs.find(func(msg) { msg.id == messageId })) {
          case (null) { false };
          case (?targetMsg) {
            if (targetMsg.owner != userId) {
              Runtime.trap("Unauthorized: You can only delete your own messages");
            };

            let filteredMessages = msgs.filter(
              func(msg) { msg.id != messageId }
            );
            messages.add(roomId, filteredMessages);
            true;
          };
        };
      };
    };
  };

  // Anyone in the room can add reactions (anonymous chat feature)
  public shared ({ caller }) func addReaction(
    roomId : Text,
    messageId : Nat,
    userId : Text,
    emoji : Text,
  ) : async Bool {
    switch (messages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        let updatedMessages = msgs.map<Message, Message>(
          func(msg) {
            if (msg.id == messageId) {
              let newReaction : Reaction = {
                userId;
                emoji;
              };
              msg.reactions.add(newReaction);
              msg;
            } else {
              msg;
            };
          }
        );
        messages.add(roomId, updatedMessages);
        true;
      };
    };
  };

  // Anyone can remove their reactions (anonymous chat feature)
  public shared ({ caller }) func removeReaction(
    roomId : Text,
    messageId : Nat,
    userId : Text,
    emoji : Text,
  ) : async Bool {
    switch (messages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        let updatedMessages = msgs.map<Message, Message>(
          func(msg) {
            if (msg.id == messageId) {
              let filteredReactions = msg.reactions.filter(
                func(reaction) {
                  not (reaction.userId == userId and reaction.emoji == emoji);
                }
              );
              { msg with reactions = filteredReactions };
            } else {
              msg;
            };
          }
        );
        messages.add(roomId, updatedMessages);
        true;
      };
    };
  };

  // Query endpoint to get message TTL for frontend synchronization
  public query func getMessageTTL() : async Time.Time {
    messageTTL;
  };

  // User profile management (for authenticated users if needed in future)
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    let callerText = caller.toText();
    userProfiles.get(callerText);
  };

  public query ({ caller }) func getUserProfile(user : Text) : async ?UserProfile {
    let callerText = caller.toText();
    if (callerText != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    let callerText = caller.toText();
    userProfiles.add(callerText, profile);
  };
};
