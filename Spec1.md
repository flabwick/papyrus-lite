You are an expert developer, I am a non-technical client. Respond with questions that clarify what I want, remembering I don't know anything about coding or development.

  

I want to create an app which allows me to make prompts to AI. The app is a web app that will be put to a certain URL.

  

The system begins as a CLI. You can type commands using /command and it opens various menus and stuff. Any menus that appear you can always click back.

  

/restart - Restarts the CLI and it's history

/prompts - Opens a UI that allows you to edit, add and delete prompts and their content. You cannot add prompts with names of existing commands (restart, prompts, subs, system, ai-model, etc). Prompts can include links {{link-name}}. The link name is either a substitute or an actual file path. The idea is these will substitute with the real content of the files as context. 

/subs - Opens a UI that allows you to edit, add and delete substitutes and their content. 

/system - Allows you to edit the system instructions for AI

/ai-model - Allows you to select the AI model that

/root - Allows you to select the exact folder path of the root folder where the links will be relative to.

/[prompt] - When you type the name of a prompt in the prompt list it will open the prompt in a preview menu. Initially it will show the unrendered version of the prompt with the {{}} links still intact. There are buttons underneath: 1) render. This is a toggle button, essentially you click it and it substitutes all the links with the full file content. When this happens the button changes from 'render' to 'reverse', then you can reverse it back to the raw unrendered state. 2) copy. Copies whatever is in the preview to the user's clipboard. If unrendered it leaves the links as they are. 3) send to AI. This will send the prompt to the AI model selected in /ai-model and with the instructions from /system. In this case it will open a new menu that's like an AI chat. The first response will stream down in rendered markdown. At the bottom there is still a textbox to type into but it's modified for just the AI interface. Basically you can type in follow up and it will send all the previous content to AI and send another response back and streams it down in markdown. 4) export. This presents a box where you can type a filepath and name but it has to be .md extension.

  

Also just typing anything into the commandline with no slash will just basically open it in the same ui as the prompts but with whatever you type into the box. So if you type {{}} links into the box it will open the UI with the same render/unrender menu.

  

For links with substitutes it should do recursive substitution. For instance I might have {{substitute1}} which maps to the content {{substitute2}} and {{substitute3}}, maybe 2 and 3 include more substitutes in their mapped content. When I use substitute1 it should substitute everything beneath it also. So {{}} can link to substitutes if it maps to an alias name or if it maps to an exact filepath. So there can be substitutes with just filename links mapped to them or ones that just have other substitutes. Example:

{

"substitute1": "Summarise the content in {{substitute2}} and {{substitute3}}",

"substitute2": "This is the content of substitute2. Make reference to {{substitute4}}

"substitute3": "{{path/to/[file1.md](http://file1.md)}}"

"substitute4": "{{[file2.md](http://file2.md)}}. This file would be in the root folder.

}

  

.md and .txt files should be supported for prompt substitution, none else really needed.

  

In the AI chat interface there should be a button to copy and export under every response. Export presents the filepath/filename textbox and copy copies to the clipboard.

  

I want to support just claude 4 or claude 3.5 haiku to start I have the keys and everything.

  

All the files are handled externally. Uploads, edits, etc, there is no need to process that just assume that all teh files in the root folder that's set can be updated at any point.

  

This is just a personal tool for me, no other users.

The app should go to port 4201 which is where I'll connect to. This port is already set up with nginx to map to a separate url - dev.jimboslice.xyz.

The commandline should be like a search prompt that recognises them from the prompt lists and also from the commands that already exist. The click back function should work as both a back button that shows in all the popup UIs and also as the escape button. 

The /root command is just a textbox it doesn't need to be a folder picker dialog. If you type something invalid into there it will show an error and get you to try again.

The app should look for changes with every prompt. When a preview is already open it doesn't need to live update, but they should be updated in between every call for prompts.

I'll set an .env file in the system which includes my API key not to paste directly into the app.

The AI chat interface should show the conversation history and allow deleting message pairs. No need to add branching or edit message functionality though.

Everything should persist across sessions. Prompts, substitutes everything. When I close the app nothing should be lost.

