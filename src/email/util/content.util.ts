export function getRecoverPasswordEmailContent(name: string, link: string) {
  return `<table border="0" cellpadding="0" cellspacing="0" height="100%" width="100%">
              <tbody>
                <tr>
                  <td>
                    <p
                      style="
                        font-size: 16px;
                        font-family: Arial, sans-serif;
                        margin-top: 0;
                        margin-bottom: 5px;
                      "
                    >
                    Hi ${name}!<br/> <br>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p
                      style="
                        font-size: 16px;
                        font-family: Arial, sans-serif;
                        margin-top: 0;
                        margin-bottom: 5px;
                      "
                    >
                    You told us you forgot your password. If you really did, click here to reset it:
                    <a href="${link}">Reset Your Password</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <br /><br /><a
                      href="${link}"
                      style="
                        padding: 16px 32px;
                        background: black;
                        color: #fff;
                        font-size: 16px;
                        border-radius: 8px;
                        text-decoration: none;
                      "
                    >
                      Reset Your Password
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
            `
}

export function getBasicEmailContent(msg = '', subject = '') {
  return `
<style type="text/css">
  html, body {
  background: #EFEFEF;
  padding: 0;
  margin: 0;
  }
</style>
<table width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF">
  <tr>
    <td width="100%" valign="top" align="center">
      <div
        style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        ${subject}
      </div>
      <center>
        <table border="0" cellpadding="0" cellspacing="0" height="100%" width="100%">
          <!-- START INTRO -->
          <tr>
            <td height="40" style="font-size: 40px; line-height: 40px;">&nbsp;</td>
          </tr>
          <tr>
            <td>
              <table cellspacing="0" cellpadding="0" border="0" bgcolor="#FFFF" width="100%" style="max-width: 660px; background: #FFFF center center; background-size: cover;"
                align="center">

                <tr>
                  <td align="center" valign="top"
                    style="font-family: Arial, sans-serif; font-size:14px; line-height:20px; color:#484848; "
                    class="body-text">
                    <p
                      style="font-family: Arial, sans-serif; font-size:18px; line-height:26px; color:#484848; padding:0 20px; margin:0; text-align: left"
                      class="body-text">
                      <br />
                      ${msg}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- END INTRO -->
          <tr>
            <td style="text-align: center">
              <br /><br /><br /><br />
              <p
                style="
                  font-style: italic;
                  font-weight: normal;
                  font-size: 16px;
                  line-height: 22px;
                  text-align: center;
                  color: #555555;
                  text-decoration: none;
                  margin-bottom: 0;
                "
              >
                Free software for free elections by
              </p>
            </td>
          </tr>
          <tr>
            <td style="text-align: center">
            <br />
                <img
                  style="margin: 0 auto"
                  src="https://s3.us-west-2.amazonaws.com/assets.goodparty.org/logo-hologram.png"
                />
            </td>
          </tr>
          <tr>
            <td style="text-align: center">
              <br /><br />
              <p
                style="
                  font-weight: normal;
                  font-size: 11px;
                  line-height: 15px;
                  /* identical to box height, or 136% */

                  text-align: center;
                  letter-spacing: 0.5px;

                  /* Neutral/N40 - Faded Ink */

                  color: #666666;
                "
              >
                To stop receiving updates, you can remove this campaign from  <a href="https://goodparty.org/profile">
                your endorsements
                </a>
              </p>
            </td>
          </tr>
        </table>
      </center>
    </td>
  </tr>
</table>`
}
