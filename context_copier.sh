#!/usr/bin/env bash

# Context Copier Script
# This script extracts specific chat-related files from your GCalendarApp
# for easy copying to other LLMs or applications

# Colors for better readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to display banner
display_banner() {
  clear
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${BLUE}       GCalendarApp Context Copier       ${NC}"
  echo -e "${GREEN}=========================================${NC}"
  echo ""
}

# List of specific files to extract
specific_files=(
  "./pages/api/chat.js"
  "./pages/chat.js"
  "./components/chat_component.js"
  "./.next/server/pages/api/chat.js"
  "./.next/server/pages/chat.js"
  "./.next/static/chunks/pages/chat.js"
  "./lib/chatbot.js"  # Added this as it's likely important for chat functionality
)

# Function to display file content with line numbers
display_file_content() {
  file=$1
  display_banner
  echo -e "${YELLOW}File: $file${NC}\n"
  echo -e "${YELLOW}=== CONTENT START (COPY BELOW THIS LINE) ===${NC}"
  echo "FILE: $file"
  echo "----------------------------------------"
  
  # Display file content with line numbers
  if [ -f "$file" ]; then
    nl -ba "$file"
  else
    echo "File not found: $file"
  fi
  
  echo "----------------------------------------"
  echo -e "${YELLOW}=== CONTENT END (COPY ABOVE THIS LINE) ===${NC}"
  echo ""
  echo "Press Enter to continue..."
  read
}

# Function to list specific files
list_specific_files() {
  display_banner
  echo -e "${YELLOW}Specific Chat-Related Files:${NC}\n"
  
  # Display files with numbers
  counter=1
  
  for file in "${specific_files[@]}"; do
    if [ -f "$file" ]; then
      echo -e "${GREEN}$counter.${NC} $file"
    else
      echo -e "${GREEN}$counter.${NC} $file ${YELLOW}(not found)${NC}"
    fi
    ((counter++))
  done
  
  echo ""
  echo -e "Enter file number to view (or 0 to return to menu): "
  read selection
  
  if [[ $selection -gt 0 && $selection -lt $counter ]]; then
    selected_file=${specific_files[$selection-1]}
    display_file_content "$selected_file"
  fi
}

# Function to export all specific files to a single file
export_specific_files() {
  display_banner
  echo -e "${YELLOW}Exporting specific chat-related files...${NC}\n"
  
  output_file="chat_context_export.txt"
  
  # Create or overwrite the output file
  echo "# GCalendarApp Chat Context Export" > "$output_file"
  echo "# Generated on $(date)" >> "$output_file"
  echo "" >> "$output_file"
  
  # Add each file's content to the output file
  for file in "${specific_files[@]}"; do
    if [ -f "$file" ]; then
      echo "## FILE: $file" >> "$output_file"
      echo "```javascript" >> "$output_file"
      cat "$file" >> "$output_file"
      echo "```" >> "$output_file"
      echo "" >> "$output_file"
      echo "" >> "$output_file"
      echo -e "Added ${GREEN}$file${NC} to export"
    else
      echo -e "${YELLOW}Skipped $file (not found)${NC}"
    fi
  done
  
  echo -e "\nExport completed to ${GREEN}$output_file${NC}"
  echo "Press Enter to continue..."
  read
}

# Main menu function
main_menu() {
  while true; do
    display_banner
    echo -e "Please select an option:"
    echo -e "${GREEN}1.${NC} View specific chat-related files"
    echo -e "${GREEN}2.${NC} Export all specific chat-related files to a single file"
    echo -e "${GREEN}0.${NC} Exit"
    echo ""
    echo -n "Enter your choice: "
    read choice
    
    case $choice in
      1) list_specific_files ;;
      2) export_specific_files ;;
      0) 
        echo "Exiting..."
        exit 0
        ;;
      *)
        echo "Invalid option. Press Enter to continue..."
        read
        ;;
    esac
  done
}

# Start the script
main_menu