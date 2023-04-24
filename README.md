# powershell-config
- Demonstração : <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/demonstracao.gif" width="2000"/>
- Instale todas as fontes da pasta abaixo
 - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/instalar-fontes.png" width="1000"/>
Instale o powershell : https://www.microsoft.com/store/productId/9MZ1SNWT0N5D
 - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/install%20powershell.png" width="150"/>
 - Abra o windows terminal e coloque como PowerShell como perfil padrão inicialização
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/windows-terminal-inicializacao.png" width="1000"/>
 - Abra o windows terminal e coloque como Terminal do windows como aplicativo terminal padrão
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/windows-terminal-inicializacao-definir-como-app-padrao.png" width="1000"/>
 - Abra as configurações do windows terminal vá em "abrir o aquivo JSON"
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/abra-config-json-terminalwindows.png" width="1000"/>
 - Copie o conteúdo do arquivo abaixo
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/copie-conteudo-do-arquivo.png" width="1000"/>
 - Cole o conteúdo do arquivo settings.json para o arquivo JSON do windows terminal
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/cole-conteudo-settings-para-aqui.png" width="1000"/>
- Habilitar o windows terminal como admin nas configurações padrões conforme a imagem abaixo 
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/habilitar-executar-admin.png" width="1000"/>
- Executar o comando : Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope CurrentUser conforme a imagem abaixo 
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/executar-comando-privacidade.png" width="1000"/>
 - Na pasta do seu usuario crie uma pasta .config como mostrado na imagem abaixo
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/na-pasta-do-seu-usuario-crie-pasta-config.png" width="1000"/>
 - Copie a pasta powershell do repo clonado para a pasta .config do usuario
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/copie-a-pasta-powershell-do-repositorio-para-confi-do-usuario.png" width="1000"/>
 - Copie o conteudo da pasta config-powershell do repo clonado para a pasta PowerShell na pasta Documentos do usuario, caso essa pasta não tenha cido criada crie!!
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/copie-o-conteudo-da-pasta-repo-config-poweshell-para-pasta-PowerShell-dos-documentos.png" width="1000"/>
 - Após toda a configuração anterior basta executar o windows terminal aceitar os termos de contrato informando "Y", provavelmente após as instalações dos modulos será apresentado uma tela muito aprecida com a abaixo. Basta fechar o terminal e abrir novamamente.
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/aceitar%20os%20termos.png" width="1000"/>
   - <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/caso-aconteca-esse-erro.png" width="1000"/>

- Para mais themes basta acessar : https://ohmyposh.dev/docs/themes
 - Selecionar o thema <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/abrir-thema.png" width="1000"/>
 - Baixar o arquivo do thema <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/baixar%20o%20arquivo%20do%20thema.png" width="1000"/>
 - Colar o arquivo do thema na pasta .config do usuario na pasta powershell <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/colar%20na%20pasta%20config%20e%20dentro%20da%20pasta%20powershell.png" width="1000"/>
 - Alterar o arquivo user_profile.ps1 do caminho <pasta-usuario>\.config\powershell colocando o arquivo do thema escolhido <img src="https://github.com/edilsonvilarinho/powershell-config/blob/master/img_/abrir-arquivo-userprofileps1.png" width="1000"/>
 
 - Referência 
   - Canal Youtube devaslife : https://www.youtube.com/watch?v=5-aK2_WwrmM&t=2056s&ab_channel=devaslife
   - Set-ExecutionPolicy : https://learn.microsoft.com/pt-br/powershell/module/microsoft.powershell.security/set-executionpolicy?view=powershell-7.3
 
