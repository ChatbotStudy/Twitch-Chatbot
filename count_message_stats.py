import csv

pathname = "all.txt"

total_messages = 0
home_channel = 0
not_home_channel = 0
messages_at_baby_home = 0
messages_at_pete_home = 0
messages_at_baby_not_home = 0
messages_at_pete_not_home = 0
#can't just sum up commands + @ interactions because there is some overlap
total_bot_interactions_home = 0
total_bot_interactions_not_home = 0
commands = {}
users = {}
known_commands = ["!inspect", "!feed", "!sing", "!channel", "!playdate", "!hold", "!wake"]


def message_directed_at_pete(username, message):
    return (not("pete_bot_" in username) and not("baby_bot_" in username) and 
        ("@pete_bot_" in message
        or "@pete_bot" in message
        or "pete_bot" in message
        or "pete_bot_" in message
        or "pete_bot__" in message
        or "@pete_bot_" in message
        or "@Pete_Bot_" in message
        or "@Pete_bot_" in message
        or "Pete_Bot_" in message
        or "Pete_bot_" in message))

def message_directed_at_baby(username, message):
    return (not("pete_bot_" in username) and not ("baby_bot_" in username) and 
        ("@baby_bot_" in message
        or "@baby_bot" in message
        or "baby_bot" in message
        or "baby_bot_" in message
        or "baby_bot__" in message
        or "@baby_bot_" in message))

def message_directed_at_bot(username, message):
    if (message_directed_at_pete(username, message) or message_directed_at_baby(username, message)):
        return True

def command_in_message(message):
    for k_cmd in known_commands:
        if k_cmd in message:
            return True
    return False

def interacted_with_bot(username, message):
    if ("pete_bot_" in username) or ("baby_bot_" in username):
        return False
    return (message_directed_at_bot(username, message) or command_in_message(message))

with open(pathname, newline='') as csvfile:
    filereader = csv.reader(csvfile, delimiter=',')
    for row in filereader:
        channel_name = row[0]
        username = row[1]
        # the below username has been replaced
        if (not("[TESTING_ACCOUNT]" in username) 
            and not("[TESTING_ACCOUNT]" in channel_name)):
            total_messages += 1
            message = row[2]

            #count total messages
            # the below username has been replaced
            if not(channel_name == "[MAIN CHANNEL NAME]"):
                not_home_channel += 1
                
                if(interacted_with_bot(username, message)):
                    total_bot_interactions_not_home += 1

                if(message_directed_at_baby(username, message)):
                    messages_at_baby_not_home += 1

                elif(message_directed_at_pete(username, message)):
                    messages_at_pete_not_home += 1
            
            # the below username has been replaced
            elif (channel_name == "[MAIN CHANNEL NAME]"):
                home_channel += 1

                if(interacted_with_bot(username, message)):
                    total_bot_interactions_home += 1

                if(message_directed_at_baby(username, message)):
                    messages_at_baby_home += 1

                elif(message_directed_at_pete(username, message)):
                    messages_at_pete_home += 1
            
            #counting interactions with the bot shouldn't include the bot itself
            if(not("pete_bot_" in username) and not("baby_bot_" in username)):
                #count commands seen in these messages
                message_split = message.split()
                commands_in_message = list(filter(lambda x: x[0] == "!", message_split))
                for command in commands_in_message:
                    if command in commands:
                        commands[command] += 1
                    else:
                        commands[command] = 1
                
            #update user dictionary, allow counting of bot in these to retain info about
            #how many times the bot sent messages, will exlude it later when counting up 
            #interactions with bot
            if username in users:
                users[username]["total_messages_in_chat"] += 1
            else:
                users[username] = {"total_messages_in_chat" : 1, "bot_interactions" : 0}

            if(interacted_with_bot(username, message)):
                users[username]["bot_interactions"] += 1

with open('message_data.csv', 'w') as f:
    f.write("command,frequency\n")
    for key in commands.keys():
        f.write("%s,%s\n"%(key,commands[key]))

with open('user_data.csv', 'w') as f:
    f.write("username,total messages,total bot interactions\n")
    for key in users.keys():
        f.write("%s,%s,%s\n"%(key,users[key]["total_messages_in_chat"],users[key]["bot_interactions"]))

print("------------")
print("total messages sent inside home channel:", home_channel)
print("total messages sent OUTSIDE of home channel:", not_home_channel)
print("total messages:", total_messages)
print("------------")
print("messages sent @baby_bot_ at home channel:", messages_at_baby_home)
print("messages sent @baby_bot_ OUTSIDE of home channel:", messages_at_baby_not_home)
print("total messages sent to @baby_bot within and outside of channel:", messages_at_baby_home + messages_at_baby_not_home)
print("------------")
print("messages sent @pete_bot inside home channel:", messages_at_pete_home)
print("messages sent @pete_bot OUTSIDE of home channel:", messages_at_pete_not_home)
print("total messages sent to @pete_bot within and outside of channel:", messages_at_pete_home + messages_at_pete_not_home)
print("------------")
print("total messages sent to bot (both names) within home channel:", messages_at_pete_home + messages_at_baby_home)
print("total messages sent to bot (both names) OUTSIDE channel:", messages_at_pete_not_home + messages_at_baby_not_home)
print("total messages sent to bot (both names) within and outside of channel:", messages_at_pete_home + messages_at_pete_not_home + messages_at_baby_home + messages_at_baby_not_home)
print("------------")

total_known_commands_used = 0
for key in commands.keys():
    for k_cmd in known_commands:
        if k_cmd in key:
            total_known_commands_used += commands[key]
            print(key + " is a known command and was used " + str(commands[key]) + " times")

print("total number of known commands used in all channels: ", total_known_commands_used)
print("------------")
print("note that we are not taking the sum of @ and commands because there is a subtle amount of overlap between the two sets")
print("all bot interactions in home channel: ", total_bot_interactions_home )
print("all bot interactions outside of home channel: ", total_bot_interactions_not_home )
print("all bot interactions in ALL channels: ", total_bot_interactions_home + total_bot_interactions_not_home)
print("------------")

#-2 is for pete_bot_, and baby_bot_ itself
total_unique_users = len(users) - 2
total_unique_users_interacting_with_bot = 0
for key in users.keys():
    if users[key]["bot_interactions"] > 0 and not("baby_bot_" in key) and not("pete_bot_" in key):
        total_unique_users_interacting_with_bot+= 1

print("total unique users, not counting baby_bot_ and pete_bot_ itself: ", total_unique_users)
print("total unique users interacting with the bot, not counting baby_bot_ and pete_bot_ itself: ", total_unique_users_interacting_with_bot)
