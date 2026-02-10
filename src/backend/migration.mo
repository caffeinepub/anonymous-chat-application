import List "mo:core/List";
import Map "mo:core/Map";
import Storage "blob-storage/Storage";

module {
  type OldMessage = {
    id : Nat;
    content : Text;
    timestamp : Int;
    nickname : Text;
    replyToId : ?Nat;
    imageUrl : ?Storage.ExternalBlob;
    videoUrl : ?Storage.ExternalBlob;
    audioUrl : ?Storage.ExternalBlob;
    isEdited : Bool;
    reactions : List.List<{ userId : Text; emoji : Text }>;
    owner : Text;
  };

  type OldActor = {
    messages : Map.Map<Text, List.List<OldMessage>>;
  };

  type NewMessage = {
    id : Nat;
    content : Text;
    timestamp : Int;
    nickname : Text;
    replyToId : ?Nat;
    imageUrl : ?Storage.ExternalBlob;
    videoUrl : ?Storage.ExternalBlob;
    audioUrl : ?Storage.ExternalBlob;
    isEdited : Bool;
    reactions : List.List<{ userId : Text; emoji : Text }>;
    owner : Text;
    nonce : ?Text;
  };

  type NewActor = {
    messages : Map.Map<Text, List.List<NewMessage>>;
  };

  public func run(old : OldActor) : NewActor {
    let newMessages = old.messages.map<Text, List.List<OldMessage>, List.List<NewMessage>>(
      func(_roomId, oldMsgList) {
        oldMsgList.map<OldMessage, NewMessage>(
          func(oldMsg) { { oldMsg with nonce = null } }
        );
      }
    );

    { messages = newMessages };
  };
};
