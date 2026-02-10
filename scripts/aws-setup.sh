#!/bin/bash
set -euo pipefail

echo "GoodParty AWS SSO Setup"
echo "======================="

cat << 'EOF'

        ############    ###########     
      #####+====+#########*====+*#####  
     ###+:        :*####=.       .=#### 
    ###=            -*=.           .*###
    ##*              :.             -###
    ##*             -#*.            -###
    ###:        .+**####**=         *###
     ###:        .+######-.        +### 
     ####-        :#####*        .*###  
       ###+:      :-. .:=.     .=####   
        ####*-.              :+####     
          #####+:         .-*####       
             ####*=:.  .-+#####         
               ######=+#####            
                   ######               
       
EOF

echo ""

if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed."
    echo ""
    echo "Install it using one of these methods:"
    echo ""
    echo "  macOS (Homebrew):  brew install awscli"
    echo "  macOS (Official):  https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    echo "  Linux:             https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    echo ""
    exit 1
fi

read -p "Enter your first name (lowercase, e.g., jane): " NAME < /dev/tty
NAME=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
if [[ -z "$NAME" ]]; then
    echo "Username cannot be empty."
    exit 1
fi

AWS_CONFIG_FILE="${HOME}/.aws/config"
mkdir -p "$(dirname "$AWS_CONFIG_FILE")"

if [[ -f "$AWS_CONFIG_FILE" ]]; then
    CLEANED_CONFIG=$(awk '
        /^\[profile gp-(readonly|engineer|admin)\]/ { skip=1; next }
        /^\[sso-session [a-z]+-gp-(readonly|engineer|admin)\]/ { skip=1; next }
        /^\[/ { skip=0 }
        !skip { print }
    ' "$AWS_CONFIG_FILE" | sed '/^$/N;/^\n$/d')
    
    echo "$CLEANED_CONFIG" > "$AWS_CONFIG_FILE"
fi

cat >> "$AWS_CONFIG_FILE" << EOF

[profile gp-readonly]
sso_session = ${NAME}-gp-readonly
sso_account_id = 333022194791
sso_role_name = ReadOnlyAccess
region = us-west-2

[sso-session ${NAME}-gp-readonly]
sso_start_url = https://goodparty.awsapps.com/start
sso_region = us-west-2
sso_registration_scopes = sso:account:access

[profile gp-engineer]
sso_session = ${NAME}-gp-engineer
sso_account_id = 333022194791
sso_role_name = EngineerAccess
region = us-west-2

[sso-session ${NAME}-gp-engineer]
sso_start_url = https://goodparty.awsapps.com/start
sso_region = us-west-2
sso_registration_scopes = sso:account:access

[profile gp-admin]
sso_session = ${NAME}-gp-admin
sso_account_id = 333022194791
sso_role_name = AdministratorAccess
region = us-west-2

[sso-session ${NAME}-gp-admin]
sso_start_url = https://goodparty.awsapps.com/start
sso_region = us-west-2
sso_registration_scopes = sso:account:access
EOF

echo "AWS config written to: $AWS_CONFIG_FILE"
echo ""
echo "To authenticate, run:"
echo ""
echo "  aws sso login --profile gp-engineer"
echo ""
echo "Available profiles:"
echo "  gp-readonly   - Read-only access"
echo "  gp-engineer   - Engineer access (recommended default)"
echo "  gp-admin      - Administrator access"
echo ""
echo "To set a default profile, add this to your shell config:"
echo ""
echo "  export AWS_PROFILE=gp-engineer"
echo ""