import Time "mo:core/Time";
import Map "mo:core/Map";
import Set "mo:core/Set";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Text "mo:core/Text";
import Array "mo:core/Array";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Storage "blob-storage/Storage";
import MixinStorage "blob-storage/Mixin";
import AccessControl "authorization/access-control";
import MixinAuthorization "authorization/MixinAuthorization";



actor {
  // Initialize the access control system
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  include MixinStorage();

  public type MediaFile = {
    file : Storage.ExternalBlob;
    originalName : Text;
    contentType : Text;
  };

  public type Message = {
    id : Nat;
    content : Text;
    timestamp : Time.Time;
    nickname : Text;
    replyToId : ?Nat;
    image : ?MediaFile;
    video : ?MediaFile;
    audio : ?MediaFile;
    isEdited : Bool;
    reactions : List.List<Reaction>;
    nonce : ?Text;
  };

  public type MessageView = {
    id : Nat;
    content : Text;
    timestamp : Time.Time;
    nickname : Text;
    replyToId : ?Nat;
    image : ?MediaFile;
    video : ?MediaFile;
    audio : ?MediaFile;
    isEdited : Bool;
    reactions : [Reaction];
    nonce : ?Text;
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
  let activeRooms = Set.empty<Text>();
  let persistentMessages = Map.empty<Text, List.List<Message>>();
  let userProfiles = Map.empty<Principal, UserProfile>();

  // User profile management functions
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    userProfiles.add(caller, profile);
  };

  func ensureRoomMessages(roomId : Text) : List.List<Message> {
    switch (persistentMessages.get(roomId)) {
      case (null) {
        let emptyList = List.empty<Message>();
        persistentMessages.add(roomId, emptyList);
        emptyList;
      };
      case (?msgs) { msgs };
    };
  };

  func nextId() : Nat {
    let id = nextMessageId;
    nextMessageId += 1;
    id;
  };

  public query ({ caller = _ }) func roomExists(roomId : Text) : async Bool {
    // No authorization needed - anyone can check if a room exists
    let trimmed = roomId.trim(#char ' ');
    trimmed.size() > 0 and activeRooms.contains(trimmed);
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
      image = message.image;
      video = message.video;
      audio = message.audio;
      isEdited = message.isEdited;
      reactions = message.reactions.toArray();
      nonce = message.nonce;
    };
  };

  func validateNickname(input : Text) : Text {
    let trimmed = input.trim(#char ' ');
    if (trimmed.size() == 0) {
      Runtime.trap("Nickname cannot be empty");
    };
    if (trimmed.size() > 20) {
      Runtime.trap("Nickname cannot exceed 20 characters");
    };
    trimmed;
  };

  func validateJoinCode(joinCode : Text) {
    let trimmed = joinCode.trim(#char ' ');
    if (trimmed.size() == 0) {
      Runtime.trap("Room join code cannot be empty");
    };
    if (trimmed.size() > 30) {
      Runtime.trap("Room join code cannot exceed 30 characters");
    };
  };

  public shared ({ caller = _ }) func createRoom(joinCode : Text, nickname : Text) : async { joinCode : Text } {
    // No authorization needed - anyone including guests can create rooms
    validateJoinCode(joinCode);
    let validNickname = validateNickname(nickname);

    if (activeRooms.contains(joinCode)) {
      Runtime.trap("Room already exists: " # joinCode);
    };

    activeRooms.add(joinCode);

    { joinCode };
  };

  public shared ({ caller = _ }) func joinRoom(joinCode : Text, nickname : Text) : async { nickname : Text } {
    // No authorization needed - anyone including guests can join rooms
    validateJoinCode(joinCode);
    let validNickname = validateNickname(nickname);

    if (not activeRooms.contains(joinCode)) {
      Runtime.trap("Room not found: " # joinCode);
    };

    { nickname = validNickname };
  };

  func getNonExpiredMessages(roomId : Text) : [MessageView] {
    switch (persistentMessages.get(roomId)) {
      case (null) { [] };
      case (?msgs) {
        let filteredMsgs = msgs.filter(isNotExpired);
        filteredMsgs.map<Message, MessageView>(convertMessageToView).toArray();
      };
    };
  };

  public query ({ caller = _ }) func getMessages(roomId : Text) : async [MessageView] {
    // No authorization needed - anyone can view messages
    validateJoinCode(roomId);
    getNonExpiredMessages(roomId);
  };

  public query ({ caller = _ }) func fetchMessagesAfterId(roomId : Text, lastId : Nat) : async [MessageView] {
    // No authorization needed - anyone can fetch messages
    validateJoinCode(roomId);
    switch (persistentMessages.get(roomId)) {
      case (null) { [] };
      case (?msgs) {
        let filteredMsgs = msgs.filter(
          func(msg) { isNotExpired(msg) and msg.id > lastId }
        );
        filteredMsgs.map<Message, MessageView>(convertMessageToView).toArray();
      };
    };
  };

  public shared ({ caller = _ }) func sendMessage(
    roomId : Text,
    content : Text,
    nickname : Text,
    replyToId : ?Nat,
    image : ?MediaFile,
    video : ?MediaFile,
    audio : ?MediaFile,
    nonce : Text
  ) : async Nat {
    // No authorization needed - anyone including guests can send messages
    let validNickname = validateNickname(nickname);
    validateJoinCode(roomId);

    let roomMessages = ensureRoomMessages(roomId);

    let existing = roomMessages.find(
      func(msg) {
        switch (msg.nonce) {
          case (null) { false };
          case (?existingNonce) { existingNonce == nonce };
        };
      }
    );

    switch (existing) {
      case (?duplicate) {
        if (duplicate.content == content) {
          return duplicate.id;
        };
      };
      case (null) {};
    };

    let messageId = nextId();

    let newMessage : Message = {
      id = messageId;
      content;
      timestamp = Time.now();
      nickname = validNickname;
      replyToId;
      image;
      video;
      audio;
      isEdited = false;
      reactions = List.empty<Reaction>();
      nonce = ?nonce;
    };

    roomMessages.add(newMessage);
    persistentMessages.add(roomId, roomMessages);

    messageId;
  };

  public shared ({ caller = _ }) func editMessage(
    roomId : Text,
    messageId : Nat,
    nickname : Text,
    newContent : Text,
    newImage : ?MediaFile,
    newVideo : ?MediaFile,
    newAudio : ?MediaFile
  ) : async Bool {
    // No authorization needed - anyone can edit messages (nickname-based ownership in frontend)
    validateJoinCode(roomId);
    let validNickname = validateNickname(nickname);
    switch (persistentMessages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        switch (msgs.find(func(msg) { msg.id == messageId })) {
          case (null) { false };
          case (?targetMsg) {
            let updatedMessages = msgs.map<Message, Message>(
              func(msg) {
                if (msg.id == messageId) {
                  {
                    msg with
                    nickname = validNickname;
                    content = newContent;
                    image = newImage;
                    video = newVideo;
                    audio = newAudio;
                    isEdited = true;
                  };
                } else {
                  msg;
                };
              }
            );
            persistentMessages.add(roomId, updatedMessages);
            true;
          };
        };
      };
    };
  };

  public shared ({ caller = _ }) func deleteMessage(roomId : Text, messageId : Nat) : async Bool {
    // No authorization needed - anyone can delete messages (nickname-based ownership in frontend)
    validateJoinCode(roomId);
    switch (persistentMessages.get(roomId)) {
      case (null) { false };
      case (?msgs) {
        switch (msgs.find(func(msg) { msg.id == messageId })) {
          case (null) { false };
          case (?_targetMsg) {
            let filteredMessages = msgs.filter(
              func(msg) { msg.id != messageId }
            );
            persistentMessages.add(roomId, filteredMessages);
            true;
          };
        };
      };
    };
  };

  public shared ({ caller = _ }) func addReaction(
    roomId : Text,
    messageId : Nat,
    userId : Text,
    emoji : Text
  ) : async Bool {
    // No authorization needed - anyone can add reactions
    validateJoinCode(roomId);
    switch (persistentMessages.get(roomId)) {
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
        persistentMessages.add(roomId, updatedMessages);
        true;
      };
    };
  };

  public shared ({ caller = _ }) func removeReaction(
    roomId : Text,
    messageId : Nat,
    userId : Text,
    emoji : Text
  ) : async Bool {
    // No authorization needed - anyone can remove reactions
    validateJoinCode(roomId);
    switch (persistentMessages.get(roomId)) {
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
        persistentMessages.add(roomId, updatedMessages);
        true;
      };
    };
  };

  public query ({ caller = _ }) func getMessageTTL() : async Time.Time {
    // No authorization needed - anyone can query the TTL
    messageTTL;
  };

  public shared ({ caller }) func pruneExpiredMessages() : async () {
    // Admin-only function - system maintenance
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can prune expired messages");
    };

    let now = Time.now();
    for ((roomId, msgList) in persistentMessages.entries()) {
      let validMsgs = msgList.filter(func(msg) { now - msg.timestamp <= messageTTL });
      if (validMsgs.size() != msgList.size()) {
        persistentMessages.add(roomId, validMsgs);
      };
    };

    for ((roomId, msgList) in persistentMessages.entries()) {
      if (msgList.size() == 0 and not activeRooms.contains(roomId)) {
        persistentMessages.remove(roomId);
      };
    };
  };
};
