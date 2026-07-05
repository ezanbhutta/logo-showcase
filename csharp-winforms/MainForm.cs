using System;
using System.Drawing;
using System.Windows.Forms;

namespace CSharpWinFormsClient
{
    public partial class MainForm : Form
    {
        public MainForm()
        {
            this.Text = "Logo Showcase - Native WinForms Client";
            this.Size = new Size(800, 600);
            this.StartPosition = FormStartPosition.CenterScreen;

            Label label = new Label
            {
                Text = "Logo Showcase running natively on Windows via WinForms/C#.",
                AutoSize = true,
                Location = new Point(20, 20),
                Font = new Font("Segoe UI", 12F, FontStyle.Regular, GraphicsUnit.Point)
            };

            this.Controls.Add(label);
        }
    }
}
