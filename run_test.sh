#!/bin/bash
source ~/.nvm/nvm.sh
nvm use 22
cd /home/devuser/projects/friscy-standalone
node test_ui_tabs.cjs
